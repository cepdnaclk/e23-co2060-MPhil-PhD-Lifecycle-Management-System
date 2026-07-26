import {
  DocumentVerificationStatus,
  DocumentType,
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowAction,
  EthicsWorkflowStage,
  ProposalStatus,
  RegistrationStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
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
  workflowStage: true,
  revisionNumber: true,
  coordinatorProposedStatus: true,
  studentDeclaredAt: true,
  supervisorRecommendedAt: true,
  coordinatorRecordedAt: true,
  hodConfirmedAt: true,
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
  decisionHistory: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      stage: true,
      action: true,
      notes: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          displayName: true,
          role: true,
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
  primarySupervisorUserId: string | null;
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
    workflowStage: record.workflowStage,
    revisionNumber: record.revisionNumber,
    coordinatorProposedStatus: record.coordinatorProposedStatus,
    studentDeclaredAt: record.studentDeclaredAt,
    supervisorRecommendedAt: record.supervisorRecommendedAt,
    coordinatorRecordedAt: record.coordinatorRecordedAt,
    hodConfirmedAt: record.hodConfirmedAt,
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
    decisionHistory: record.decisionHistory.map((decision) => ({
      id: decision.id,
      stage: decision.stage,
      action: decision.action,
      notes: decision.notes,
      createdAt: decision.createdAt,
      actor: decision.actor,
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
      supervisorAssignments: {
        where: {
          effectiveTo: null,
          isPrimary: true,
        },
        select: {
          supervisorUserId: true,
        },
        take: 1,
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
      primarySupervisorUserId:
        student.supervisorAssignments[0]?.supervisorUserId ?? null,
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

  if (
    student.approvals.length > 0 &&
    student.approvals[0]?.workflowStage !==
      EthicsWorkflowStage.STUDENT_DECLARATION
  ) {
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
  const existingRecord = student.approvals[0] ?? null;
  const approvalId = existingRecord?.id ?? randomUUID();
  const revisionNumber = existingRecord
    ? existingRecord.revisionNumber + 1
    : 1;
  const documentIds = verifiedSession.files.map(() => randomUUID());
  try {
    await withSerializableRetry(async (tx) => {
      const now = new Date();
      if (existingRecord) {
        await tx.ethicsApproval.update({
          where: { id: approvalId },
          data: {
            title: parsed.data.title,
            summary: parsed.data.summary,
            applicability: EthicsApplicability.REQUIRED,
            status: EthicsRecordStatus.PENDING,
            workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
            revisionNumber,
            coordinatorProposedStatus: null,
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: now,
            studentDeclaredAt: now,
            supervisorRecommendedAt: null,
            coordinatorRecordedAt: null,
            hodConfirmedAt: null,
            referenceNumber: null,
            validUntil: null,
          },
        });
        await tx.document.updateMany({
          where: {
            ethicsApprovalId: approvalId,
            isCurrentVersion: true,
          },
          data: { isCurrentVersion: false },
        });
      } else {
        await tx.ethicsApproval.create({
          data: {
            id: approvalId,
            studentId: student.id,
            title: parsed.data.title,
            summary: parsed.data.summary,
            applicability: EthicsApplicability.REQUIRED,
            status: EthicsRecordStatus.PENDING,
            workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: now,
            studentDeclaredAt: now,
          },
        });
      }

      for (const [index, document] of verifiedSession.files.entries()) {
        await tx.document.create({
          data: {
            id: documentIds[index],
            documentType: DocumentType.ETHICS_APPROVAL,
            studentId: student.id,
            ethicsApprovalId: approvalId,
            fileName: document.fileName,
            storagePath: document.storagePath,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            checksumSha256: document.checksumSha256,
            verificationStatus: DocumentVerificationStatus.VERIFIED,
            verifiedAt: now,
            version: revisionNumber,
            isCurrentVersion: true,
          },
        });
      }
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
      await tx.ethicsWorkflowDecision.create({
        data: {
          ethicsApprovalId: approvalId,
          stage: EthicsWorkflowStage.STUDENT_DECLARATION,
          action: existingRecord
            ? EthicsWorkflowAction.STUDENT_RESUBMITTED
            : EthicsWorkflowAction.STUDENT_DECLARED_REQUIRED,
          actorUserId: auth.userId,
          metadata: {
            applicability: EthicsApplicability.REQUIRED,
            revisionNumber,
            documentCount: verifiedSession.files.length,
          },
        },
      });
      await appendLifecycleEventAndEnqueue(
        tx,
        {
          eventKey: `ethics:${approvalId}:student-declaration:${revisionNumber}`,
          eventType: LIFECYCLE_EVENT.ETHICS_STUDENT_DECLARED,
          aggregateType: "EthicsApproval",
          aggregateId: approvalId,
          actorUserId: auth.userId,
          actorRole: auth.role,
          previousState:
            existingRecord?.workflowStage ??
            EthicsWorkflowStage.STUDENT_DECLARATION,
          newState: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
          metadata: {
            applicability: EthicsApplicability.REQUIRED,
            revisionNumber,
            documentCount: verifiedSession.files.length,
          },
        },
        student.primarySupervisorUserId
          ? [
              {
                eventKey: `ethics:${approvalId}:student-declaration:${revisionNumber}:supervisor`,
                recipientId: student.primarySupervisorUserId,
                studentId: student.id,
                notificationEvent: "ETHICS_APPROVAL_SUBMITTED",
                title: "Ethics evidence awaiting recommendation",
                message:
                  "A Student submitted verified ethics evidence for Supervisor review.",
                actionUrl: "/dashboard/supervisor/ethics",
              },
            ]
          : [],
      );
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

export async function listEthicsApprovals(auth: AuthenticatedUserContext) {
  if (
    auth.role !== UserRole.ADMINISTRATOR &&
    auth.role !== UserRole.HOD &&
    auth.role !== UserRole.SUPERVISOR
  ) {
    throw new EthicsApprovalError(
      "You cannot access the Department ethics queue.",
      403,
    );
  }

  const approvals = await prisma.ethicsApproval.findMany({
    where: {
      isArchived: false,
      ...(auth.role === UserRole.SUPERVISOR
        ? {
            student: {
              supervisorAssignments: {
                some: {
                  supervisorUserId: auth.userId,
                  effectiveTo: null,
                },
              },
            },
          }
        : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    select: ethicsApprovalSelect,
  });

  return approvals.map(mapEthicsApproval);
}
