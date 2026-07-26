import {
  DocumentVerificationStatus,
  DocumentType,
  ProposalStatus,
  RegistrationStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { notify } from "@/lib/notifications";
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
  ethicsApprovalSubmissionSchema,
  ethicsApprovalUploadRequestSchema,
  type EthicsApprovalSubmissionInput,
  type EthicsApprovalUploadRequest,
} from "@/lib/ethics/schemas";

export {
  ethicsApprovalSubmissionSchema,
  ethicsApprovalUploadRequestSchema,
};

export class EthicsApprovalError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "EthicsApprovalError";
    this.status = status;
  }
}

const ethicsApprovalSelect = {
  id: true,
  studentId: true,
  title: true,
  summary: true,
  applicability: true,
  status: true,
  referenceNumber: true,
  validUntil: true,
  notes: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  documents: {
    where: {
      isDeleted: false,
    },
    orderBy: {
      createdAt: "desc",
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
      id: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      programType: true,
    },
  },
} satisfies Prisma.EthicsApprovalSelect;

type EthicsApprovalRecord = Prisma.EthicsApprovalGetPayload<{
  select: typeof ethicsApprovalSelect;
}>;

type StudentEthicsContext = {
  id: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  hasActiveRegistration: boolean;
  hasApprovedProposal: boolean;
  approvals: EthicsApprovalRecord[];
};

function mapEthicsApproval(record: EthicsApprovalRecord) {
  return {
    id: record.id,
    studentId: record.studentId,
    title: record.title,
    summary: record.summary,
    applicability: record.applicability,
    status: record.status,
    referenceNumber: record.referenceNumber,
    validUntil: record.validUntil,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    student: {
      id: record.student.id,
      displayName: record.student.user.displayName,
      email: record.student.user.email,
      programType: record.student.programType,
    },
    documents: record.documents.map((document) => ({
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

async function findStudentEthicsContext(
  auth: AuthenticatedUserContext,
): Promise<StudentEthicsContext | null> {
  return prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
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
          isArchived: false,
        },
        select: {
          id: true,
        },
        take: 1,
      },
      ethicsApprovals: {
        where: {
          isArchived: false,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: ethicsApprovalSelect,
      },
    },
  }).then((student) => {
    if (!student) {
      return null;
    }

    return {
      id: student.id,
      user: student.user,
      hasActiveRegistration: student.registrations.length > 0,
      hasApprovedProposal: student.researchProposals.length > 0,
      approvals: student.ethicsApprovals,
    };
  });
}

function getEthicsSubmissionBlockedReason(student: StudentEthicsContext) {
  if (!student.hasActiveRegistration) {
    return "An active registration is required before submitting ethics documents.";
  }

  if (!student.hasApprovedProposal) {
    return "Your proposal must be approved before submitting ethics documents.";
  }

  if (student.approvals.length > 0) {
    return "Ethics documents have already been submitted for this student.";
  }

  return null;
}

async function requireStudentEthicsContext(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.STUDENT) {
    throw new EthicsApprovalError("Only students can submit ethics documents.", 403);
  }

  const student = await findStudentEthicsContext(auth);

  if (!student) {
    throw new EthicsApprovalError("Student profile not found.", 404);
  }

  return student;
}

async function notifyAdministratorsOfEthicsSubmission(input: {
  studentId: string;
  studentName: string;
  documentTitle: string;
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
          event: "ETHICS_APPROVAL_SUBMITTED",
          recipientUserId: administrator.id,
          to: administrator.email,
          administratorName: administrator.displayName,
          studentName: input.studentName,
          studentId: input.studentId,
          applicationTitle: input.documentTitle,
        }),
      ),
  );
}

export async function createEthicsApprovalUploadUrl(
  input: EthicsApprovalUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = ethicsApprovalUploadRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new EthicsApprovalError(
      parsed.error.issues[0]?.message ?? "Invalid ethics upload request.",
      400,
    );
  }

  const student = await requireStudentEthicsContext(auth);
  const blockedReason = getEthicsSubmissionBlockedReason(student);

  if (blockedReason) {
    throw new EthicsApprovalError(blockedReason, 409);
  }

  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.ETHICS_APPROVAL,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      student.id,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new EthicsApprovalError(error.message, error.status);
    }
    throw error;
  }
}

export async function submitEthicsApproval(
  input: EthicsApprovalSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = ethicsApprovalSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new EthicsApprovalError(
      parsed.error.issues[0]?.message ?? "Invalid ethics document submission.",
      400,
    );
  }

  const student = await requireStudentEthicsContext(auth);
  let verification;
  try {
    verification = await verifyUploadSessionForFinalize(
      parsed.data.uploadSessionId,
      UploadPurpose.ETHICS_APPROVAL,
      auth,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new EthicsApprovalError(error.message, error.status);
    }
    throw error;
  }

  if (verification.state === "FINALIZED") {
    const existing = await prisma.ethicsApproval.findUnique({
      where: { id: verification.finalizedEntityId },
      select: ethicsApprovalSelect,
    });
    if (!existing) {
      throw new EthicsApprovalError(
        "Finalized ethics submission could not be loaded.",
        500,
      );
    }
    return mapEthicsApproval(existing);
  }

  const blockedReason = getEthicsSubmissionBlockedReason(student);
  if (blockedReason) {
    await reopenUploadSessionAfterFinalizeFailure(
      verification.session.id,
      blockedReason,
    );
    throw new EthicsApprovalError(blockedReason, 409);
  }

  const verifiedSession = verification.session;
  const approvalId = randomUUID();
  const documentIds = verifiedSession.files.map(() => randomUUID());
  try {
    await withSerializableRetry(async (tx) => {
      await tx.ethicsApproval.create({
        data: {
          id: approvalId,
          studentId: student.id,
          title: parsed.data.title,
          summary: parsed.data.summary,
          documents: {
            create: verifiedSession.files.map((document, index) => ({
              id: documentIds[index],
              documentType: DocumentType.ETHICS_APPROVAL,
              studentId: student.id,
              fileName: document.fileName,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              checksumSha256: document.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: new Date(),
              version: 1,
              isCurrentVersion: true,
            })),
          },
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
          finalizedEntityId: approvalId,
          result: { documentCount: verifiedSession.files.length },
        },
      });
    });
  } catch (error) {
    await reopenUploadSessionAfterFinalizeFailure(
      verifiedSession.id,
      error instanceof Error ? error.message : "Ethics finalization failed.",
    );
    throw error;
  }

  const approval = await prisma.ethicsApproval.findUnique({
    where: { id: approvalId },
    select: ethicsApprovalSelect,
  });
  if (!approval) {
    throw new EthicsApprovalError("Submitted ethics record could not be loaded.", 500);
  }

  await notifyAdministratorsOfEthicsSubmission({
    studentId: student.id,
    studentName: student.user.displayName,
    documentTitle: approval.title,
  });

  return mapEthicsApproval(approval);
}

export async function getStudentEthicsApprovalOverview(
  auth: AuthenticatedUserContext,
) {
  const student = await requireStudentEthicsContext(auth);
  const submissionBlockedReason = getEthicsSubmissionBlockedReason(student);

  return {
    approvals: student.approvals.map(mapEthicsApproval),
    latestApproval: student.approvals[0]
      ? mapEthicsApproval(student.approvals[0])
      : null,
    canSubmit: submissionBlockedReason === null,
    submissionBlockedReason,
    hasActiveRegistration: student.hasActiveRegistration,
    hasApprovedProposal: student.hasApprovedProposal,
  };
}

export async function listEthicsApprovals() {
  const approvals = await prisma.ethicsApproval.findMany({
    where: {
      isArchived: false,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: ethicsApprovalSelect,
  });

  return approvals.map(mapEthicsApproval);
}
