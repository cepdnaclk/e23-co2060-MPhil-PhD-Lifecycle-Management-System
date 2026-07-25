import {
  AcademicStatus,
  CorrectionType,
  DocumentVerificationStatus,
  DocumentType,
  ThesisStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { notify, notifyInBackground } from "@/lib/notifications";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import { assertValidThesisStatusTransition } from "@/lib/prisma/thesis-status";
import { prisma } from "@/lib/prisma/client";
import {
  createStagedUploadSession,
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";
import {
  correctionUploadRequestSchema,
  correctionSubmissionSchema,
  type CorrectionUploadRequest,
  type CorrectionSubmissionInput,
} from "@/lib/theses/schemas";
import type { AuthenticatedUserContext } from "@/types/auth";

export class ThesisCorrectionError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ThesisCorrectionError";
    this.status = status;
  }
}

type ThesisCorrectionStudentContext = {
  id: string;
  academicStatus: AcademicStatus;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  thesis: {
    id: string;
    title: string;
    status: ThesisStatus;
    studentId: string;
    corrections: Array<{
      id: string;
      isApproved: boolean;
      approvedAt: Date | null;
      approvedById: string | null;
      correctionType: CorrectionType;
      description: string | null;
      createdAt: Date;
      documents: Array<{
        id: string;
        fileName: string;
        storagePath: string;
        mimeType: string;
        version: number;
        isCurrentVersion: boolean;
        createdAt: Date;
      }>;
    }>;
  } | null;
};

type ThesisCorrectionSubmissionContext = ThesisCorrectionStudentContext & {
  thesis: NonNullable<ThesisCorrectionStudentContext["thesis"]>;
};

async function findStudentCorrectionContext(
  thesisId: string,
  auth: AuthenticatedUserContext,
): Promise<ThesisCorrectionStudentContext | null> {
  return prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      academicStatus: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      theses: {
        where: {
          id: thesisId,
          isArchived: false,
        },
        take: 1,
        select: {
          id: true,
          title: true,
          status: true,
          studentId: true,
          corrections: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              isApproved: true,
              approvedAt: true,
              approvedById: true,
              correctionType: true,
              description: true,
              createdAt: true,
              documents: {
                where: {
                  isDeleted: false,
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
      },
    },
  }).then((student) => {
    if (!student) {
      return null;
    }

    return {
      id: student.id,
      academicStatus: student.academicStatus,
      user: student.user,
      thesis: student.theses[0] ?? null,
    };
  });
}

async function requireCorrectionSubmissionContext(
  thesisId: string,
  auth: AuthenticatedUserContext,
): Promise<ThesisCorrectionSubmissionContext> {
  const student = await findStudentCorrectionContext(thesisId, auth);

  if (!student) {
    throw new ThesisCorrectionError("Student profile not found.", 404);
  }

  if (!student.thesis) {
    throw new ThesisCorrectionError("Thesis not found.", 404);
  }

  if (student.academicStatus === AcademicStatus.GRADUATED) {
    throw new ThesisCorrectionError(
      "Graduated student profiles are read-only.",
      403,
    );
  }

  if (student.thesis.status !== ThesisStatus.CORRECTIONS_REQUIRED) {
    throw new ThesisCorrectionError(
      "Correction uploads are only allowed while the thesis status is CORRECTIONS_REQUIRED.",
      409,
    );
  }

  return student as ThesisCorrectionSubmissionContext;
}

function formatCorrectionTypeLabel(correctionType: CorrectionType) {
  return correctionType === CorrectionType.MINOR ? "Minor" : "Major";
}

async function notifyAdministratorsOfCorrectionSubmission(input: {
  studentName: string;
  thesisTitle: string;
  correctionType: CorrectionType;
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
        notify({
          event: "CORRECTIONS_REQUIRED",
          recipientUserId: administrator.id,
          to: administrator.email,
          administratorName: administrator.displayName,
          studentName: input.studentName,
          thesisTitle: input.thesisTitle,
          correctionTypeLabel: formatCorrectionTypeLabel(input.correctionType),
        }),
      ),
  );
}

export async function submitCorrectionDocument(
  thesisId: string,
  input: CorrectionSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = correctionSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ThesisCorrectionError(
      parsed.error.issues[0]?.message ?? "Invalid correction submission.",
      400,
    );
  }

  const student = await requireCorrectionSubmissionContext(thesisId, auth);

  let verification;
  try {
    verification = await verifyUploadSessionForFinalize(
      parsed.data.uploadSessionId,
      UploadPurpose.CORRECTION,
      auth,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ThesisCorrectionError(error.message, error.status);
    }
    throw error;
  }

  if (verification.state === "FINALIZED") {
    const existing = await prisma.correctionDocument.findUnique({
      where: { id: verification.finalizedEntityId },
      include: { documents: { where: { isDeleted: false } } },
    });
    if (!existing) {
      throw new ThesisCorrectionError(
        "Finalized correction submission could not be loaded.",
        500,
      );
    }
    return {
      correction: {
        ...existing,
        document: existing.documents[0] ?? null,
      },
    };
  }

  const verifiedSession = verification.session;
  const correctionId = randomUUID();
  const documentIds = verifiedSession.files.map(() => randomUUID());
  let correction;
  try {
    correction = await withSerializableRetry(async (tx) => {
    const createdCorrection = await tx.correctionDocument.create({
      data: {
        id: correctionId,
        thesisId: student.thesis.id,
        correctionType: parsed.data.correctionType,
        description: parsed.data.description,
        isApproved: false,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    const documents = await Promise.all(
      verifiedSession.files.map((document, index) => {
        return tx.document.create({
          data: {
            id: documentIds[index],
            studentId: student.id,
            thesisId: student.thesis.id,
            correctionDocumentId: createdCorrection.id,
            documentType: DocumentType.CORRECTION,
            fileName: document.fileName,
            storagePath: document.storagePath,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            checksumSha256: document.checksumSha256,
            verificationStatus: DocumentVerificationStatus.VERIFIED,
            verifiedAt: new Date(),
            version: 1,
            isCurrentVersion: true,
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
        });
      }),
    );

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
        finalizedEntityId: createdCorrection.id,
        result: { documentCount: documents.length },
      },
    });

    return {
      correction: {
        id: createdCorrection.id,
        correctionType: parsed.data.correctionType,
        description: parsed.data.description ?? null,
        isApproved: false,
        approvedAt: null,
        approvedById: null,
        createdAt: createdCorrection.createdAt,
        documents,
        document: documents[0] ?? null,
      },
      documents,
    };
    });
  } catch (error) {
    await reopenUploadSessionAfterFinalizeFailure(
      verifiedSession.id,
      error instanceof Error ? error.message : "Correction finalization failed.",
    );
    throw error;
  }

  await notifyAdministratorsOfCorrectionSubmission({
    studentName: student.user.displayName,
    thesisTitle: student.thesis.title,
    correctionType: parsed.data.correctionType,
  });

  return {
    correction: correction.correction,
  };
}

export async function createCorrectionUploadUrl(
  thesisId: string,
  input: CorrectionUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = correctionUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThesisCorrectionError(
      parsed.error.issues[0]?.message ?? "Invalid correction upload request.",
      400,
    );
  }
  const student = await requireCorrectionSubmissionContext(thesisId, auth);
  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.CORRECTION,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      `${student.id}/${student.thesis.id}`,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ThesisCorrectionError(error.message, error.status);
    }
    throw error;
  }
}

async function requireAdministratorContext(auth: AuthenticatedUserContext) {
  const administrator = await prisma.administrator.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
    },
  });

  if (!administrator) {
    throw new ThesisCorrectionError("Administrator profile not found.", 404);
  }

  return administrator;
}

async function requireThesisCorrectionRecord(thesisId: string, correctionId: string) {
  const correction = await prisma.correctionDocument.findFirst({
    where: {
      id: correctionId,
      thesisId,
    },
    select: {
      id: true,
      thesisId: true,
      isApproved: true,
      approvedAt: true,
      approvedById: true,
    },
  });

  if (!correction) {
    throw new ThesisCorrectionError("Correction document not found.", 404);
  }

  return correction;
}

export async function approveCorrectionDocument(
  thesisId: string,
  correctionId: string,
  auth: AuthenticatedUserContext,
) {
  const administrator = await requireAdministratorContext(auth);
  const correction = await requireThesisCorrectionRecord(thesisId, correctionId);

  if (correction.isApproved) {
    return correction;
  }

  return prisma.correctionDocument.update({
    where: {
      id: correction.id,
    },
    data: {
      isApproved: true,
      approvedAt: new Date(),
      approvedById: administrator.id,
    },
    select: {
      id: true,
      thesisId: true,
      correctionType: true,
      description: true,
      isApproved: true,
      approvedAt: true,
      approvedById: true,
    },
  });
}

export async function listThesisCorrections(
  thesisId: string,
  auth: AuthenticatedUserContext,
) {
  await requireAdministratorContext(auth);

  const thesis = await prisma.thesis.findUnique({
    where: {
      id: thesisId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      student: {
        select: {
          id: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      },
      corrections: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          correctionType: true,
          description: true,
          isApproved: true,
          approvedAt: true,
          approvedById: true,
          createdAt: true,
          documents: {
            where: {
              isDeleted: false,
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
  });

  if (!thesis) {
    throw new ThesisCorrectionError("Thesis not found.", 404);
  }

  return thesis;
}

export async function archiveThesisAfterCorrections(
  thesisId: string,
  auth: AuthenticatedUserContext,
) {
  await requireAdministratorContext(auth);

  const thesis = await prisma.thesis.findUnique({
    where: {
      id: thesisId,
    },
    select: {
      id: true,
      status: true,
      studentId: true,
      student: {
        select: {
          academicStatus: true,
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      corrections: {
        where: {
          isApproved: true,
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!thesis) {
    throw new ThesisCorrectionError("Thesis not found.", 404);
  }

  if (
    thesis.status !== ThesisStatus.CORRECTIONS_REQUIRED &&
    thesis.status !== ThesisStatus.FINAL_ARCHIVE
  ) {
    throw new ThesisCorrectionError(
      "Only correction-complete theses can be archived.",
      409,
    );
  }

  if (
    thesis.status === ThesisStatus.CORRECTIONS_REQUIRED &&
    thesis.corrections.length === 0
  ) {
    throw new ThesisCorrectionError(
      "At least one approved correction document is required before final archive.",
      409,
    );
  }

  if (
    thesis.status === ThesisStatus.CORRECTIONS_REQUIRED
  ) {
    try {
      assertValidThesisStatusTransition(
        ThesisStatus.CORRECTIONS_REQUIRED,
        ThesisStatus.FINAL_ARCHIVE,
      );
    } catch (error) {
      throw new ThesisCorrectionError(
        error instanceof Error ? error.message : "Invalid thesis archive transition.",
        409,
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedThesis =
      thesis.status === ThesisStatus.FINAL_ARCHIVE
        ? await tx.thesis.findUniqueOrThrow({
            where: {
              id: thesis.id,
            },
            select: {
              id: true,
              status: true,
              title: true,
            },
          })
        : await tx.thesis.update({
            where: {
              id: thesis.id,
            },
            data: {
              status: ThesisStatus.FINAL_ARCHIVE,
            },
            select: {
              id: true,
              status: true,
              title: true,
            },
          });

    const updatedStudent =
      thesis.student.academicStatus === AcademicStatus.GRADUATED
        ? await tx.student.findUniqueOrThrow({
            where: {
              id: thesis.studentId,
            },
            select: {
              id: true,
              academicStatus: true,
            },
          })
        : await tx.student.update({
            where: {
              id: thesis.studentId,
            },
            data: {
              academicStatus: AcademicStatus.GRADUATED,
            },
            select: {
              id: true,
              academicStatus: true,
            },
          });

    return {
      thesis: updatedThesis,
      student: updatedStudent,
    };
  });

  if (thesis.student.user.email) {
    notifyInBackground({
      event: "THESIS_ARCHIVED",
      recipientUserId: thesis.student.user.id,
      to: thesis.student.user.email,
      studentName: thesis.student.user.displayName,
      thesisTitle: result.thesis.title,
    });
  }

  return result;
}
