import {
  DocumentType,
  EthicsApprovalStatus,
  ProposalStatus,
  RegistrationStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { notify, notifyInBackground } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  buildEthicsApprovalStoragePath,
  generateUploadSignedUrl,
  normalizeStoragePath,
  StorageAccessError,
} from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

import {
  ethicsApprovalDecisionSchema,
  ethicsApprovalSubmissionSchema,
  ethicsApprovalUploadRequestSchema,
  type EthicsApprovalDecisionInput,
  type EthicsApprovalSubmissionInput,
  type EthicsApprovalUploadRequest,
} from "@/lib/ethics/schemas";

export {
  ethicsApprovalDecisionSchema,
  ethicsApprovalSubmissionSchema,
  ethicsApprovalUploadRequestSchema,
};

export class EthicsApprovalError extends Error {
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 413 | 500 = 400) {
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
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  reviewedById: true,
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
  reviewedBy: {
    select: {
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
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
    status: record.status,
    reviewNotes: record.reviewNotes,
    reviewedAt: record.reviewedAt,
    reviewedById: record.reviewedById,
    reviewedByName: record.reviewedBy?.user.displayName ?? null,
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

function assertEthicsPdfUpload(input: {
  contentType: string;
  fileSizeBytes: number;
  path: string;
}) {
  if (input.contentType !== "application/pdf") {
    throw new EthicsApprovalError("Only PDF documents are allowed.", 400);
  }

  try {
    assertFileUploadConstraints(input);
  } catch (error) {
    if (error instanceof StorageAccessError) {
      throw new EthicsApprovalError(error.message, error.status);
    }

    throw error;
  }

  const normalizedPath = normalizeStoragePath(input.path);

  if (!normalizedPath.startsWith("ethics-approvals/")) {
    throw new EthicsApprovalError(
      "Ethics approval documents must be uploaded to the ethics-approvals directory.",
      400,
    );
  }
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
    return "An active registration is required before submitting ethics approval.";
  }

  if (!student.hasApprovedProposal) {
    return "Your proposal must be approved before submitting ethics approval.";
  }

  const latestApproval = student.approvals[0] ?? null;

  if (!latestApproval) {
    return null;
  }

  if (latestApproval.status === EthicsApprovalStatus.APPROVED) {
    return "Your ethics approval has already been approved.";
  }

  if (
    latestApproval.status === EthicsApprovalStatus.SUBMITTED ||
    latestApproval.status === EthicsApprovalStatus.UNDER_REVIEW
  ) {
    return "An ethics approval submission is already waiting for review.";
  }

  return null;
}

async function requireStudentEthicsContext(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.STUDENT) {
    throw new EthicsApprovalError("Only students can submit ethics approval.", 403);
  }

  const student = await findStudentEthicsContext(auth);

  if (!student) {
    throw new EthicsApprovalError("Student profile not found.", 404);
  }

  return student;
}

function resolveApprovalIdFromStoragePath(studentId: string, storagePath: string) {
  const normalizedPath = normalizeStoragePath(storagePath);
  const [root, ownerId, approvalId] = normalizedPath.split("/");

  if (root !== "ethics-approvals" || ownerId !== studentId || !approvalId) {
    throw new EthicsApprovalError(
      "The uploaded ethics approval file does not match the expected storage path.",
      409,
    );
  }

  return approvalId;
}

function assertValidEthicsDecisionTransition(
  currentStatus: EthicsApprovalStatus,
  nextStatus: EthicsApprovalStatus,
) {
  if (currentStatus === EthicsApprovalStatus.APPROVED) {
    throw new EthicsApprovalError("Approved ethics records are immutable.", 409);
  }

  if (currentStatus === EthicsApprovalStatus.REJECTED) {
    throw new EthicsApprovalError(
      "Rejected ethics records are final. Ask the student to submit a new application.",
      409,
    );
  }

  if (nextStatus === EthicsApprovalStatus.SUBMITTED) {
    throw new EthicsApprovalError("Ethics approval cannot be moved back to submitted.", 400);
  }
}

async function notifyAdministratorsOfEthicsSubmission(input: {
  studentId: string;
  studentName: string;
  applicationTitle: string;
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
          applicationTitle: input.applicationTitle,
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

  const approvalId = crypto.randomUUID();
  const storagePath = buildEthicsApprovalStoragePath(
    student.id,
    approvalId,
    parsed.data.fileName,
  );

  assertEthicsPdfUpload({
    contentType: parsed.data.contentType,
    fileSizeBytes: parsed.data.fileSizeBytes,
    path: storagePath,
  });

  const signedUrl = await generateUploadSignedUrl(
    storagePath,
    parsed.data.contentType,
  );

  return {
    approvalId,
    signedUrl,
    storagePath,
    expiresInMinutes: 15,
  };
}

export async function submitEthicsApproval(
  input: EthicsApprovalSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = ethicsApprovalSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new EthicsApprovalError(
      parsed.error.issues[0]?.message ?? "Invalid ethics approval submission.",
      400,
    );
  }

  const student = await requireStudentEthicsContext(auth);
  const blockedReason = getEthicsSubmissionBlockedReason(student);

  if (blockedReason) {
    throw new EthicsApprovalError(blockedReason, 409);
  }

  const approvalId = resolveApprovalIdFromStoragePath(
    student.id,
    parsed.data.document.storagePath,
  );
  const expectedStoragePath = buildEthicsApprovalStoragePath(
    student.id,
    approvalId,
    parsed.data.document.fileName,
  );

  assertEthicsPdfUpload({
    contentType: parsed.data.document.mimeType,
    fileSizeBytes: parsed.data.document.sizeBytes,
    path: expectedStoragePath,
  });

  if (parsed.data.document.storagePath !== expectedStoragePath) {
    throw new EthicsApprovalError(
      "The uploaded ethics approval file does not match the expected storage path.",
      409,
    );
  }

  const approval = await prisma.ethicsApproval.create({
    data: {
      id: approvalId,
      studentId: student.id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      status: EthicsApprovalStatus.SUBMITTED,
      documents: {
        create: {
          documentType: DocumentType.ETHICS_APPROVAL,
          studentId: student.id,
          fileName: parsed.data.document.fileName,
          storagePath: parsed.data.document.storagePath,
          mimeType: parsed.data.document.mimeType,
          version: 1,
          isCurrentVersion: true,
        },
      },
    },
    select: ethicsApprovalSelect,
  });

  await notifyAdministratorsOfEthicsSubmission({
    studentId: student.id,
    studentName: student.user.displayName,
    applicationTitle: approval.title,
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

async function requireAdministratorContext(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new EthicsApprovalError("Only administrators can review ethics approval.", 403);
  }

  const administrator = await prisma.administrator.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
    },
  });

  if (!administrator) {
    throw new EthicsApprovalError("Administrator profile not found.", 404);
  }

  return administrator;
}

export async function listEthicsApprovals(input: {
  status?: EthicsApprovalStatus;
} = {}) {
  const approvals = await prisma.ethicsApproval.findMany({
    where: {
      isArchived: false,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: ethicsApprovalSelect,
  });

  return approvals.map(mapEthicsApproval);
}

export async function updateEthicsApprovalDecision(
  approvalId: string,
  input: EthicsApprovalDecisionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = ethicsApprovalDecisionSchema.safeParse(input);

  if (!parsed.success) {
    throw new EthicsApprovalError(
      parsed.error.issues[0]?.message ?? "Invalid ethics approval decision.",
      400,
    );
  }

  const administrator = await requireAdministratorContext(auth);
  const existingApproval = await prisma.ethicsApproval.findUnique({
    where: {
      id: approvalId,
    },
    select: ethicsApprovalSelect,
  });

  if (!existingApproval || existingApproval.isArchived) {
    throw new EthicsApprovalError("Ethics approval record not found.", 404);
  }

  assertValidEthicsDecisionTransition(existingApproval.status, parsed.data.status);

  const updatedApproval = await prisma.ethicsApproval.update({
    where: {
      id: existingApproval.id,
    },
    data: {
      status: parsed.data.status,
      reviewNotes: parsed.data.reviewNotes,
      reviewedAt: new Date(),
      reviewedById: administrator.id,
    },
    select: ethicsApprovalSelect,
  });

  if (updatedApproval.student.user.email) {
    notifyInBackground({
      event: "ETHICS_APPROVAL_STATUS_CHANGED",
      recipientUserId: updatedApproval.student.user.id,
      to: updatedApproval.student.user.email,
      studentName: updatedApproval.student.user.displayName,
      studentId: updatedApproval.student.id,
      applicationTitle: updatedApproval.title,
      statusLabel: updatedApproval.status,
      reviewNotes: updatedApproval.reviewNotes ?? undefined,
    });
  }

  return mapEthicsApproval(updatedApproval);
}
