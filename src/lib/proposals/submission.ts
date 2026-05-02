import {
  ApplicationStatus,
  DocumentType,
  ProposalStatus,
  RegistrationStatus,
  UserRole,
} from "@prisma/client";

import { notify } from "@/lib/notifications";
import { assertValidProposalStatusTransition } from "@/lib/prisma/proposal-status";
import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  buildProposalStoragePath,
  generateUploadSignedUrl,
  normalizeStoragePath,
  StorageAccessError,
} from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

import {
  proposalStatusUpdateSchema,
  proposalSubmissionSchema,
  proposalUploadRequestSchema,
  type ProposalStatusUpdateInput,
  type ProposalSubmissionInput,
  type ProposalUploadRequest,
} from "@/lib/proposals/schemas";

export {
  proposalStatusUpdateSchema,
  proposalSubmissionSchema,
  proposalUploadRequestSchema,
};

type ProposalDocumentRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
};

type ProposalRecord = {
  id: string;
  title: string;
  abstract: string;
  status: ProposalStatus;
  currentVersion: number;
  applicationId: string;
  createdAt: Date;
  updatedAt: Date;
  documents: ProposalDocumentRecord[];
};

export class ProposalSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ProposalSubmissionError";
    this.status = status;
  }
}

function mapProposalRecord(proposal: ProposalRecord) {
  return {
    id: proposal.id,
    title: proposal.title,
    abstract: proposal.abstract,
    status: proposal.status,
    currentVersion: proposal.currentVersion,
    applicationId: proposal.applicationId,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    documents: proposal.documents.map((document) => ({
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

type StudentProposalContext = {
  id: string;
  hasActiveRegistration: boolean;
  hasAssignedSupervisors: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  application: {
    id: string;
    status: ApplicationStatus;
    researchProposal: ProposalRecord | null;
  } | null;
};

type StudentProposalSubmissionContext = StudentProposalContext & {
  application: NonNullable<StudentProposalContext["application"]>;
};

async function findStudentProposalContext(
  auth: AuthenticatedUserContext,
): Promise<StudentProposalContext | null> {
  return prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
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
      supervisorAssignments: {
        select: {
          id: true,
        },
        take: 1,
      },
      application: {
        select: {
          id: true,
          status: true,
          researchProposal: {
            select: {
              id: true,
              title: true,
              abstract: true,
              status: true,
              currentVersion: true,
              applicationId: true,
              createdAt: true,
              updatedAt: true,
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
      hasActiveRegistration: student.registrations.length > 0,
      hasAssignedSupervisors: student.supervisorAssignments.length > 0,
      user: student.user,
      application: student.application,
    };
  });
}

function assertProposalPdfUpload(input: {
  contentType: string;
  fileSizeBytes: number;
  path: string;
}) {
  if (input.contentType !== "application/pdf") {
    throw new ProposalSubmissionError("Only PDF documents are allowed.", 400);
  }

  try {
    assertFileUploadConstraints(input);
  } catch (error) {
    if (error instanceof StorageAccessError) {
      throw new ProposalSubmissionError(error.message, error.status);
    }

    throw error;
  }

  const normalizedPath = normalizeStoragePath(input.path);

  if (!normalizedPath.startsWith("proposals/")) {
    throw new ProposalSubmissionError(
      "Proposal documents must be uploaded to the proposals directory.",
      400,
    );
  }
}

function getExpectedNextVersion(proposal: ProposalRecord | null): number {
  if (!proposal) {
    return 1;
  }

  if (proposal.status !== ProposalStatus.REJECTED) {
    throw new ProposalSubmissionError(
      "A revised proposal can only be uploaded after the current proposal is rejected.",
      409,
    );
  }

  return proposal.currentVersion + 1;
}

function resolveInitialProposalStatus(student: StudentProposalContext) {
  return student.hasAssignedSupervisors
    ? ProposalStatus.UNDER_REVIEW
    : ProposalStatus.SUBMITTED;
}

async function requireStudentProposalContext(
  auth: AuthenticatedUserContext,
  requireActiveRegistration = false,
): Promise<StudentProposalSubmissionContext> {
  const student = await findStudentProposalContext(auth);

  if (!student) {
    throw new ProposalSubmissionError("Student profile not found.", 404);
  }

  if (!student.application || student.application.status !== ApplicationStatus.ADMITTED) {
    throw new ProposalSubmissionError(
      "No admitted application is available for proposal submission.",
      409,
    );
  }

  if (requireActiveRegistration && !student.hasActiveRegistration) {
    throw new ProposalSubmissionError(
      "Your registration is lapsed. Renew it before submitting a proposal.",
      403,
    );
  }

  return student as StudentProposalSubmissionContext;
}

export function assertValidProposalUploadFile(input: {
  studentId: string;
  version: number;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}) {
  const storagePath = buildProposalStoragePath(
    input.studentId,
    input.version,
    input.fileName,
  );

  assertProposalPdfUpload({
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    path: storagePath,
  });

  return storagePath;
}

export async function createProposalUploadUrl(
  input: ProposalUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = proposalUploadRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProposalSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid upload request.",
      400,
    );
  }

  const student = await requireStudentProposalContext(auth, true);
  const version = getExpectedNextVersion(student.application.researchProposal);
  const storagePath = assertValidProposalUploadFile({
    studentId: student.id,
    version,
    fileName: parsed.data.fileName,
    contentType: parsed.data.contentType,
    fileSizeBytes: parsed.data.fileSizeBytes,
  });
  const signedUrl = await generateUploadSignedUrl(storagePath, parsed.data.contentType);

  return {
    signedUrl,
    storagePath,
    version,
    expiresInMinutes: 15,
  };
}

export async function submitResearchProposal(
  input: ProposalSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = proposalSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProposalSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid proposal submission.",
      400,
    );
  }

  const student = await requireStudentProposalContext(auth, true);
  const existingProposal = student.application.researchProposal;
  const nextVersion = getExpectedNextVersion(existingProposal);
  const nextStatus = resolveInitialProposalStatus(student);
  const expectedStoragePath = assertValidProposalUploadFile({
    studentId: student.id,
    version: nextVersion,
    fileName: parsed.data.document.fileName,
    contentType: parsed.data.document.mimeType,
    fileSizeBytes: parsed.data.document.sizeBytes,
  });

  if (parsed.data.document.storagePath !== expectedStoragePath) {
    throw new ProposalSubmissionError(
      "The uploaded proposal file does not match the expected storage path.",
      409,
    );
  }

  const proposal = await prisma.$transaction(async (tx) => {
    if (!existingProposal) {
      return tx.researchProposal.create({
        data: {
          studentId: student.id,
          applicationId: student.application.id,
          title: parsed.data.title,
          abstract: parsed.data.abstract,
          status: nextStatus,
          currentVersion: 1,
          documents: {
            create: {
              documentType: DocumentType.PROPOSAL,
              fileName: parsed.data.document.fileName,
              storagePath: parsed.data.document.storagePath,
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
          currentVersion: true,
          applicationId: true,
          createdAt: true,
          updatedAt: true,
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
      });
    }

    await tx.document.updateMany({
      where: {
        researchProposalId: existingProposal.id,
        isCurrentVersion: true,
        isDeleted: false,
      },
      data: {
        isCurrentVersion: false,
      },
    });

    return tx.researchProposal.update({
      where: {
        id: existingProposal.id,
      },
      data: {
        title: parsed.data.title,
        abstract: parsed.data.abstract,
        status: nextStatus,
        currentVersion: nextVersion,
        documents: {
          create: {
            documentType: DocumentType.PROPOSAL,
            fileName: parsed.data.document.fileName,
            storagePath: parsed.data.document.storagePath,
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
        currentVersion: true,
        applicationId: true,
        createdAt: true,
        updatedAt: true,
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
    });
  });

  return mapProposalRecord(proposal);
}

export async function getStudentProposalOverview(auth: AuthenticatedUserContext) {
  const student = await findStudentProposalContext(auth);

  if (!student) {
    throw new ProposalSubmissionError("Student profile not found.", 404);
  }

  const proposal = student.application?.researchProposal
    ? mapProposalRecord(student.application.researchProposal)
    : null;

  const submissionBlockedReason =
    !student.application || student.application.status !== ApplicationStatus.ADMITTED
      ? "An admitted application is required before you can submit a proposal."
      : !student.hasActiveRegistration
        ? "An active registration is required before you can submit a proposal."
        : proposal && proposal.status !== ProposalStatus.REJECTED
          ? "You can submit a new proposal version only after the current one is rejected."
          : null;

  return {
    proposal,
    canSubmitNewVersion: submissionBlockedReason === null,
    submissionBlockedReason,
    hasActiveRegistration: student.hasActiveRegistration,
    applicationId: student.application?.id ?? null,
  };
}

export async function updateResearchProposalStatus(
  proposalId: string,
  input: ProposalStatusUpdateInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = proposalStatusUpdateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProposalSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid proposal status payload.",
      400,
    );
  }

  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new ProposalSubmissionError(
      "Only administrators can update the proposal status. Supervisors must submit evaluations instead.",
      403,
    );
  }

  if (parsed.data.status === ProposalStatus.APPROVED) {
    if (auth.role !== UserRole.ADMINISTRATOR) {
      throw new ProposalSubmissionError(
        "Only an Administrator can transition a proposal to APPROVED.",
        403,
      );
    }
  }

  const proposal = await prisma.researchProposal.findUnique({
    where: {
      id: proposalId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      currentVersion: true,
      applicationId: true,
      abstract: true,
      createdAt: true,
      updatedAt: true,
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
      student: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    throw new ProposalSubmissionError("Research proposal not found.", 404);
  }

  try {
    assertValidProposalStatusTransition(proposal.status, parsed.data.status);
  } catch (error) {
    throw new ProposalSubmissionError(
      error instanceof Error
        ? error.message
        : "Invalid proposal status transition.",
      400,
    );
  }

  const updatedProposal = await prisma.researchProposal.update({
    where: {
      id: proposal.id,
    },
    data: {
      status: parsed.data.status,
    },
    select: {
      id: true,
      title: true,
      abstract: true,
      status: true,
      currentVersion: true,
      applicationId: true,
      createdAt: true,
      updatedAt: true,
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
  });

  if (proposal.student.user.email) {
    await notify({
      event: "PROPOSAL_STATUS_CHANGED",
      recipientUserId: proposal.student.user.id,
      to: proposal.student.user.email,
      studentName: proposal.student.user.displayName,
      proposalTitle: proposal.title,
      statusLabel: parsed.data.status,
      feedback: parsed.data.feedback,
    });
  }

  return mapProposalRecord(updatedProposal);
}
