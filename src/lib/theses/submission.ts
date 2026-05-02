import {
  AcademicStatus,
  DocumentType,
  ProgramType,
  ProposalStatus,
  RegistrationStatus,
  ThesisStatus,
  UserRole,
} from "@prisma/client";

import { notifyThesisSubmittedToAdministrator } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  buildVersionedThesisStoragePath,
  generateUploadSignedUrl,
  normalizeStoragePath,
  StorageAccessError,
} from "@/lib/storage";
import {
  thesisSubmissionSchema,
  type ThesisSubmissionInput,
} from "@/lib/theses/schemas";
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
  approvedProposal: {
    id: string;
    status: ProposalStatus;
  } | null;
  activeTheses: ActiveThesisRecord[];
};

export class ThesisSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 413 | 500 = 400) {
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
      approvedProposal: student.researchProposals[0] ?? null,
      activeTheses: student.theses,
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

function assertThesisPdfUpload(input: {
  contentType: string;
  fileSizeBytes: number;
  path: string;
}) {
  if (input.contentType !== "application/pdf") {
    throw new ThesisSubmissionError("Only PDF documents are allowed.", 400);
  }

  try {
    assertFileUploadConstraints(input);
  } catch (error) {
    if (error instanceof StorageAccessError) {
      throw new ThesisSubmissionError(error.message, error.status);
    }

    throw error;
  }

  const normalizedPath = normalizeStoragePath(input.path);

  if (!normalizedPath.startsWith("theses/")) {
    throw new ThesisSubmissionError(
      "Thesis documents must be uploaded to the theses directory.",
      400,
    );
  }
}

function getExpectedNextVersion(thesis: ActiveThesisRecord | null) {
  if (!thesis) {
    return 1;
  }

  return Math.max(0, thesis.documents[0]?.version ?? 0) + 1;
}

export function assertValidThesisUploadFile(input: {
  studentId: string;
  version: number;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}) {
  const storagePath = buildVersionedThesisStoragePath(
    input.studentId,
    input.version,
    input.fileName,
  );

  assertThesisPdfUpload({
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    path: storagePath,
  });

  return storagePath;
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
  const nextVersion = getExpectedNextVersion(student.activeThesis);
  const storagePath = assertValidThesisUploadFile({
    studentId: student.id,
    version: nextVersion,
    fileName: parsed.data.document.fileName,
    contentType: parsed.data.document.mimeType,
    fileSizeBytes: parsed.data.document.sizeBytes,
  });

  const signedUrl = await generateUploadSignedUrl(
    storagePath,
    parsed.data.document.mimeType,
  );

  const thesis = await prisma.$transaction(async (tx) => {
    if (!student.activeThesis) {
      return tx.thesis.create({
        data: {
          studentId: student.id,
          title: parsed.data.title,
          abstract: parsed.data.abstract,
          status: ThesisStatus.SUBMITTED,
          documents: {
            create: {
              studentId: student.id,
              documentType: DocumentType.THESIS,
              fileName: parsed.data.document.fileName,
              storagePath,
              mimeType: parsed.data.document.mimeType,
              version: 1,
              isCurrentVersion: true,
            },
          },
        },
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
      });
    }

    await tx.document.updateMany({
      where: {
        thesisId: student.activeThesis.id,
        documentType: DocumentType.THESIS,
        isCurrentVersion: true,
        isDeleted: false,
      },
      data: {
        isCurrentVersion: false,
      },
    });

    return tx.thesis.update({
      where: {
        id: student.activeThesis.id,
      },
      data: {
        title: parsed.data.title,
        abstract: parsed.data.abstract,
        status: ThesisStatus.SUBMITTED,
        documents: {
          create: {
            studentId: student.id,
            documentType: DocumentType.THESIS,
            fileName: parsed.data.document.fileName,
            storagePath,
            mimeType: parsed.data.document.mimeType,
            version: nextVersion,
            isCurrentVersion: true,
          },
        },
      },
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
    });
  });

  await notifyAdministratorsOfThesisSubmission({
    studentName: student.user.displayName,
    thesisTitle: thesis.title,
    programType: student.programType,
  });

  return {
    thesis: mapThesisRecord(thesis),
    upload: {
      signedUrl,
      storagePath,
      version: nextVersion,
      expiresInMinutes: 15,
    },
  };
}
