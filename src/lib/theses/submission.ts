import { randomUUID } from "node:crypto";

import {
  AcademicStatus,
  DocumentVerificationStatus,
  DocumentType,
  ProgramType,
  ProposalStatus,
  RegistrationStatus,
  ThesisStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";

import {
  notifyProgressReportSubmitted,
  notifyThesisSubmittedToAdministrator,
} from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import {
  withSerializableRetry,
} from "@/lib/prisma/transactions";
import {
  thesisSubmissionSchema,
  thesisUploadRequestSchema,
  type ThesisSubmissionInput,
  type ThesisUploadRequest,
} from "@/lib/theses/schemas";
import {
  createStagedUploadSession,
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

type ThesisDocumentRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
};

type ActiveThesisRecord = {
  id: string;
  title: string;
  abstract: string;
  status: ThesisStatus;
  documents: ThesisDocumentRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type ThesisStudentContext = {
  id: string;
  programType: ProgramType;
  academicStatus: AcademicStatus;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  hasActiveRegistration: boolean;
  hasEthicsSubmission: boolean;
  approvedProposal: {
    id: string;
    status: ProposalStatus;
  } | null;
  activeTheses: ActiveThesisRecord[];
  supervisorAssignments: Array<{
    supervisor: {
      user: {
        id: string;
        displayName: string;
        email: string;
        isActive: boolean;
      };
    };
  }>;
};

export class ThesisSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ThesisSubmissionError";
    this.status = status;
  }
}

function mapThesisRecord(thesis: ActiveThesisRecord) {
  return {
    id: thesis.id,
    title: thesis.title,
    abstract: thesis.abstract,
    status: thesis.status,
    createdAt: thesis.createdAt,
    updatedAt: thesis.updatedAt,
    documents: thesis.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      version: document.version,
      isCurrentVersion: document.isCurrentVersion,
      createdAt: document.createdAt,
    })),
  };
}

async function findThesisStudentContext(
  auth: AuthenticatedUserContext,
): Promise<ThesisStudentContext | null> {
  return prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      programType: true,
      academicStatus: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
          expirationDate: {
            gte: new Date(),
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
      researchProposals: {
        where: {
          status: ProposalStatus.APPROVED,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          status: true,
        },
      },
      ethicsApprovals: {
        where: {
          isArchived: false,
        },
        select: {
          id: true,
        },
        take: 1,
      },
      supervisorAssignments: {
        select: {
          supervisor: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
      theses: {
        where: {
          isArchived: false,
          status: {
            in: [
              ThesisStatus.SUBMITTED,
              ThesisStatus.UNDER_EXAMINATION,
              ThesisStatus.CORRECTIONS_REQUIRED,
            ],
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 2,
        select: {
          id: true,
          title: true,
          abstract: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          documents: {
            where: {
              isDeleted: false,
              documentType: DocumentType.THESIS,
            },
            orderBy: {
              version: "desc",
            },
            select: {
              id: true,
              fileName: true,
              storagePath: true,
              mimeType: true,
              version: true,
              isCurrentVersion: true,
              createdAt: true,
            },
          },
        },
      },
    },
  }).then((student) => {
    if (!student) {
      return null;
    }

    return {
      id: student.id,
      programType: student.programType,
      academicStatus: student.academicStatus,
      user: student.user,
      hasActiveRegistration: student.registrations.length > 0,
      hasEthicsSubmission: student.ethicsApprovals.length > 0,
      approvedProposal: student.researchProposals[0] ?? null,
      activeTheses: student.theses,
      supervisorAssignments: student.supervisorAssignments,
    };
  });
}

async function requireStudentThesisContext(auth: AuthenticatedUserContext) {
  const student = await findThesisStudentContext(auth);

  if (!student) {
    throw new ThesisSubmissionError("Student profile not found.", 404);
  }

  if (student.approvedProposal?.status !== ProposalStatus.APPROVED) {
    throw new ThesisSubmissionError(
      "An approved research proposal is required before thesis submission.",
      409,
    );
  }

  if (!student.hasEthicsSubmission) {
    throw new ThesisSubmissionError(
      "Ethics documents must be submitted before thesis submission.",
      409,
    );
  }

  if (student.academicStatus !== AcademicStatus.ACTIVE) {
    throw new ThesisSubmissionError(
      "Only students with ACTIVE academic status can submit a thesis.",
      403,
    );
  }

  if (!student.hasActiveRegistration) {
    throw new ThesisSubmissionError(
      "Your registration is lapsed. Renew it before submitting a thesis.",
      403,
    );
  }

  if (student.activeTheses.length > 1) {
    throw new ThesisSubmissionError(
      "Multiple active thesis records were found for this student.",
      409,
    );
  }

  const activeThesis = student.activeTheses[0] ?? null;

  if (
    activeThesis &&
    activeThesis.status !== ThesisStatus.CORRECTIONS_REQUIRED
  ) {
    throw new ThesisSubmissionError(
      "Only one active thesis submission is allowed at a time.",
      409,
    );
  }

  return {
    ...student,
    activeThesis,
  };
}

function formatProgramType(programType: ProgramType) {
  return programType === ProgramType.PHD ? "PhD" : programType;
}

async function notifyAdministratorsOfThesisSubmission(input: {
  studentName: string;
  thesisTitle: string;
  programType: ProgramType;
}) {
  const administrators = await prisma.user.findMany({
    where: {
      role: UserRole.ADMINISTRATOR,
      isActive: true,
    },
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  });

  await Promise.all(
    administrators
      .filter((administrator) => administrator.email)
      .map((administrator) =>
        notifyThesisSubmittedToAdministrator({
          recipientUserId: administrator.id,
          to: administrator.email,
          administratorName: administrator.displayName,
          studentName: input.studentName,
          thesisTitle: input.thesisTitle,
          programTypeLabel: formatProgramType(input.programType),
        }),
      ),
  );
}

async function notifyAssignedSupervisorsOfThesisSubmission(input: {
  student: ThesisStudentContext;
  thesisTitle: string;
}) {
  await Promise.all(
    input.student.supervisorAssignments
      .map((assignment) => assignment.supervisor.user)
      .filter((supervisor) => supervisor.isActive && supervisor.email)
      .map((supervisor) =>
        notifyProgressReportSubmitted({
          recipientUserId: supervisor.id,
          to: supervisor.email,
          supervisorName: supervisor.displayName,
          studentName: input.student.user.displayName,
          periodLabel: `thesis submission: ${input.thesisTitle}`,
        }),
      ),
  );
}

export async function createThesisUploadUrl(
  input: ThesisUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = thesisUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThesisSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid thesis upload request.",
      400,
    );
  }

  const student = await requireStudentThesisContext(auth);
  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.THESIS,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      student.id,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ThesisSubmissionError(error.message, error.status);
    }
    throw error;
  }
}

export async function submitThesis(
  input: ThesisSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = thesisSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ThesisSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid thesis submission.",
      400,
    );
  }

  const student = await requireStudentThesisContext(auth);
  let verification;
  try {
    verification = await verifyUploadSessionForFinalize(
      parsed.data.uploadSessionId,
      UploadPurpose.THESIS,
      auth,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ThesisSubmissionError(error.message, error.status);
    }
    throw error;
  }

  if (verification.state === "FINALIZED") {
    const existing = await prisma.thesis.findUnique({
      where: { id: verification.finalizedEntityId },
      select: {
        id: true,
        title: true,
        abstract: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        documents: {
          where: { isDeleted: false, documentType: DocumentType.THESIS },
          orderBy: [{ version: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            fileName: true,
            storagePath: true,
            mimeType: true,
            version: true,
            isCurrentVersion: true,
            createdAt: true,
          },
        },
      },
    });
    if (!existing) {
      throw new ThesisSubmissionError(
        "Finalized thesis record could not be loaded.",
        500,
      );
    }
    return { thesis: mapThesisRecord(existing) };
  }

  const verifiedSession = verification.session;
  let thesisId: string;
  try {
    thesisId = await withSerializableRetry(async (tx) => {
      let thesis = await tx.thesis.findFirst({
        where: {
          studentId: student.id,
          isArchived: false,
          status: {
            in: [
              ThesisStatus.SUBMITTED,
              ThesisStatus.UNDER_EXAMINATION,
              ThesisStatus.CORRECTIONS_REQUIRED,
            ],
          },
        },
        select: { id: true, status: true },
      });

      if (thesis && thesis.status !== ThesisStatus.CORRECTIONS_REQUIRED) {
        throw new ThesisSubmissionError(
          "Only one active thesis submission is allowed at a time.",
          409,
        );
      }

      if (!thesis) {
        thesis = await tx.thesis.create({
          data: {
            studentId: student.id,
            title: parsed.data.title,
            abstract: parsed.data.abstract,
            status: ThesisStatus.SUBMITTED,
          },
          select: { id: true, status: true },
        });
      }

      const latest = await tx.thesisVersion.aggregate({
        where: { thesisId: thesis.id },
        _max: { versionNumber: true },
      });
      const nextVersion = (latest._max.versionNumber ?? 0) + 1;
      const versionId = randomUUID();
      const documentIds = verifiedSession.files.map(() => randomUUID());

      await tx.thesisVersion.updateMany({
        where: { thesisId: thesis.id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.document.updateMany({
        where: {
          thesisId: thesis.id,
          documentType: DocumentType.THESIS,
          isCurrentVersion: true,
          isDeleted: false,
        },
        data: { isCurrentVersion: false },
      });

      await tx.thesisVersion.create({
        data: {
          id: versionId,
          thesisId: thesis.id,
          versionNumber: nextVersion,
          isCurrent: true,
          manifestHash: verifiedSession.manifestHash,
          submittedByUserId: auth.userId,
          documents: {
            create: verifiedSession.files.map((document, index) => ({
              id: documentIds[index],
              studentId: student.id,
              thesisId: thesis.id,
              documentType: DocumentType.THESIS,
              fileName: document.fileName,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              checksumSha256: document.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: new Date(),
              version: nextVersion,
              isCurrentVersion: true,
            })),
          },
        },
      });

      await tx.thesis.update({
        where: { id: thesis.id },
        data: {
          title: parsed.data.title,
          abstract: parsed.data.abstract,
          status: ThesisStatus.SUBMITTED,
        },
      });

      for (const [index, file] of verifiedSession.files.entries()) {
        await tx.stagedUploadFile.update({
          where: { id: file.id },
          data: { documentId: documentIds[index] },
        });
      }

      await tx.uploadSession.update({
        where: { id: verifiedSession.id },
        data: {
          status: UploadSessionStatus.FINALIZED,
          finalizedAt: new Date(),
          finalizedEntityId: thesis.id,
          result: { thesisVersionId: versionId, versionNumber: nextVersion },
        },
      });

      return thesis.id;
    });
  } catch (error) {
    await reopenUploadSessionAfterFinalizeFailure(
      verifiedSession.id,
      error instanceof Error ? error.message : "Thesis finalization failed.",
    );
    throw error;
  }

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      abstract: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      documents: {
        where: { isDeleted: false, documentType: DocumentType.THESIS },
        orderBy: [{ version: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          fileName: true,
          storagePath: true,
          mimeType: true,
          version: true,
          isCurrentVersion: true,
          createdAt: true,
        },
      },
    },
  });
  if (!thesis) {
    throw new ThesisSubmissionError("Finalized thesis could not be loaded.", 500);
  }

  await notifyAdministratorsOfThesisSubmission({
    studentName: student.user.displayName,
    thesisTitle: thesis.title,
    programType: student.programType,
  });

  await notifyAssignedSupervisorsOfThesisSubmission({
    student,
    thesisTitle: thesis.title,
  });

  return {
    thesis: mapThesisRecord(thesis),
  };
}
