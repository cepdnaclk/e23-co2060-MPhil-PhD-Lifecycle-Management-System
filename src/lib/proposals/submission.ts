import { randomUUID } from "node:crypto";

import {
  ApplicationStatus,
  DocumentVerificationStatus,
  DocumentType,
  ProposalStatus,
  RegistrationStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";

import { notify } from "@/lib/notifications";
import { assertValidProposalStatusTransition } from "@/lib/prisma/proposal-status";
import { prisma } from "@/lib/prisma/client";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import {
  createStagedUploadSession,
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";
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
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
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
  getExpectedNextVersion(student.application.researchProposal);

  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.PROPOSAL,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      student.id,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ProposalSubmissionError(error.message, error.status);
    }
    throw error;
  }
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
  getExpectedNextVersion(student.application.researchProposal);
  const nextStatus = resolveInitialProposalStatus(student);
  let verification;
  try {
    verification = await verifyUploadSessionForFinalize(
      parsed.data.uploadSessionId,
      UploadPurpose.PROPOSAL,
      auth,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ProposalSubmissionError(error.message, error.status);
    }
    throw error;
  }

  if (verification.state === "FINALIZED") {
    const existing = await prisma.researchProposal.findUnique({
      where: { id: verification.finalizedEntityId },
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
          where: { isDeleted: false },
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
      throw new ProposalSubmissionError(
        "Finalized proposal record could not be loaded.",
        500,
      );
    }
    return mapProposalRecord(existing);
  }

  const verifiedSession = verification.session;
  let proposalId: string;

  try {
    proposalId = await withSerializableRetry(async (tx) => {
      let proposal = await tx.researchProposal.findUnique({
        where: { applicationId: student.application.id },
        select: { id: true, status: true },
      });

      if (proposal && proposal.status !== ProposalStatus.REJECTED) {
        throw new ProposalSubmissionError(
          "A revised proposal can only be uploaded after the current proposal is rejected.",
          409,
        );
      }

      if (!proposal) {
        proposal = await tx.researchProposal.create({
          data: {
            studentId: student.id,
            applicationId: student.application.id,
            title: parsed.data.title,
            abstract: parsed.data.abstract,
            status: nextStatus,
            currentVersion: 1,
          },
          select: { id: true, status: true },
        });
      }

      const latest = await tx.proposalVersion.aggregate({
        where: { researchProposalId: proposal.id },
        _max: { versionNumber: true },
      });
      const nextVersion = (latest._max.versionNumber ?? 0) + 1;
      const versionId = randomUUID();
      const documentIds = verifiedSession.files.map(() => randomUUID());

      await tx.proposalVersion.updateMany({
        where: { researchProposalId: proposal.id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.document.updateMany({
        where: {
          researchProposalId: proposal.id,
          isCurrentVersion: true,
          isDeleted: false,
        },
        data: { isCurrentVersion: false },
      });

      await tx.proposalVersion.create({
        data: {
          id: versionId,
          researchProposalId: proposal.id,
          versionNumber: nextVersion,
          isCurrent: true,
          manifestHash: verifiedSession.manifestHash,
          submittedByUserId: auth.userId,
          documents: {
            create: verifiedSession.files.map((document, index) => ({
              id: documentIds[index],
              studentId: student.id,
              researchProposalId: proposal.id,
              documentType: DocumentType.PROPOSAL,
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

      await tx.researchProposal.update({
        where: { id: proposal.id },
        data: {
          title: parsed.data.title,
          abstract: parsed.data.abstract,
          status: nextStatus,
          currentVersion: nextVersion,
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
          finalizedEntityId: proposal.id,
          result: { proposalVersionId: versionId, versionNumber: nextVersion },
        },
      });

      return proposal.id;
    });
  } catch (error) {
    await reopenUploadSessionAfterFinalizeFailure(
      verifiedSession.id,
      error instanceof Error ? error.message : "Proposal finalization failed.",
    );
    throw error;
  }

  const proposal = await prisma.researchProposal.findUnique({
    where: { id: proposalId },
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
        where: { isDeleted: false },
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
  if (!proposal) {
    throw new ProposalSubmissionError("Finalized proposal could not be loaded.", 500);
  }

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
      "Only administrators can update the proposal status. Examiners submit textual reviews instead.",
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
