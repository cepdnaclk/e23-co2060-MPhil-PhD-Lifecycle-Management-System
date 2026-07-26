import {
  DocumentVerificationStatus,
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowAction,
  EthicsWorkflowStage,
  ProposalStatus,
  RegistrationStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentEthicsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentEthicsError";
    this.status = status;
  }
}

function cleanNotes(notes: string | undefined) {
  const value = notes?.trim();
  return value ? value : undefined;
}

async function listActiveRoleRecipients(
  tx: Prisma.TransactionClient,
  role: UserRole,
) {
  return tx.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
}

async function requireStudentDeclarationContext(
  tx: Prisma.TransactionClient,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new DepartmentEthicsError(
      "Only a Student can submit an ethics applicability declaration.",
      403,
    );
  }

  const student = await tx.student.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
        },
        select: { id: true },
        take: 1,
      },
      researchProposals: {
        where: {
          status: ProposalStatus.APPROVED,
          isArchived: false,
        },
        select: { id: true },
        take: 1,
      },
      supervisorAssignments: {
        where: {
          effectiveTo: null,
          isPrimary: true,
        },
        select: { supervisorUserId: true },
        take: 1,
      },
      ethicsApprovals: {
        where: { isArchived: false },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!student) {
    throw new DepartmentEthicsError("Student profile not found.", 404);
  }
  if (student.registrations.length === 0) {
    throw new DepartmentEthicsError(
      "An active registration is required before declaring ethics applicability.",
      409,
    );
  }
  if (student.researchProposals.length === 0) {
    throw new DepartmentEthicsError(
      "An approved proposal is required before declaring ethics applicability.",
      409,
    );
  }

  return {
    ...student,
    currentRecord: student.ethicsApprovals[0] ?? null,
    primarySupervisorUserId:
      student.supervisorAssignments[0]?.supervisorUserId ?? null,
  };
}

export async function declareEthicsNotRequired(
  input: {
    title: string;
    summary: string;
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  return withSerializableRetry(async (tx) => {
    const context = await requireStudentDeclarationContext(tx, auth);
    const existing = context.currentRecord;

    if (
      existing &&
      existing.workflowStage !== EthicsWorkflowStage.STUDENT_DECLARATION
    ) {
      throw new DepartmentEthicsError(
        "The current ethics record is awaiting Department action.",
        409,
      );
    }

    const now = new Date();
    const notes = cleanNotes(input.notes);
    const record = existing
      ? await tx.ethicsApproval.update({
          where: { id: existing.id },
          data: {
            title: input.title.trim(),
            summary: input.summary.trim(),
            applicability: EthicsApplicability.NOT_REQUIRED,
            status: EthicsRecordStatus.PENDING,
            workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
            revisionNumber: { increment: 1 },
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: now,
            studentDeclaredAt: now,
            coordinatorProposedStatus: null,
            notes,
          },
        })
      : await tx.ethicsApproval.create({
          data: {
            studentId: context.id,
            title: input.title.trim(),
            summary: input.summary.trim(),
            applicability: EthicsApplicability.NOT_REQUIRED,
            status: EthicsRecordStatus.PENDING,
            workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: now,
            studentDeclaredAt: now,
            notes,
          },
        });

    await tx.ethicsWorkflowDecision.create({
      data: {
        ethicsApprovalId: record.id,
        stage: EthicsWorkflowStage.STUDENT_DECLARATION,
        action: existing
          ? EthicsWorkflowAction.STUDENT_RESUBMITTED
          : EthicsWorkflowAction.STUDENT_DECLARED_NOT_REQUIRED,
        actorUserId: auth.userId,
        notes,
        metadata: {
          applicability: EthicsApplicability.NOT_REQUIRED,
          revisionNumber: record.revisionNumber,
        },
      },
    });

    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `ethics:${record.id}:student-declaration:${record.revisionNumber}`,
        eventType: LIFECYCLE_EVENT.ETHICS_STUDENT_DECLARED,
        aggregateType: "EthicsApproval",
        aggregateId: record.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState:
          existing?.workflowStage ?? EthicsWorkflowStage.STUDENT_DECLARATION,
        newState: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
        metadata: {
          applicability: EthicsApplicability.NOT_REQUIRED,
          revisionNumber: record.revisionNumber,
        },
      },
      context.primarySupervisorUserId
        ? [
            {
              eventKey: `ethics:${record.id}:student-declaration:${record.revisionNumber}:supervisor`,
              recipientId: context.primarySupervisorUserId,
              studentId: context.id,
              notificationEvent: "ETHICS_APPROVAL_SUBMITTED",
              title: "Ethics declaration awaiting recommendation",
              message:
                "A Student declared that formal ethics approval is not required.",
              actionUrl: "/dashboard/supervisor/ethics",
            },
          ]
        : [],
    );

    return record;
  });
}

export async function recommendEthicsRecord(
  ethicsRecordId: string,
  input: {
    decision: "RECOMMEND" | "RETURN";
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.SUPERVISOR) {
    throw new DepartmentEthicsError(
      "Only an assigned Supervisor can review the ethics declaration.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const record = await tx.ethicsApproval.findUnique({
      where: { id: ethicsRecordId },
      include: {
        student: {
          select: {
            id: true,
            userId: true,
            supervisorAssignments: {
              where: {
                supervisorUserId: auth.userId,
                effectiveTo: null,
              },
              select: { id: true, isPrimary: true },
            },
          },
        },
        documents: {
          where: {
            isDeleted: false,
            isCurrentVersion: true,
            verificationStatus: DocumentVerificationStatus.VERIFIED,
          },
          select: { id: true },
        },
      },
    });

    if (!record) {
      throw new DepartmentEthicsError("Ethics record not found.", 404);
    }
    if (record.student.supervisorAssignments.length === 0) {
      throw new DepartmentEthicsError(
        "You are not an active Supervisor for this Student.",
        403,
      );
    }
    if (
      record.workflowStage !== EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION
    ) {
      throw new DepartmentEthicsError(
        "This ethics record is not awaiting a Supervisor recommendation.",
        409,
      );
    }
    if (
      input.decision === "RECOMMEND" &&
      record.applicability === EthicsApplicability.REQUIRED &&
      record.documents.length === 0
    ) {
      throw new DepartmentEthicsError(
        "Verified ethics evidence is required before recommendation.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    const nextStage =
      input.decision === "RECOMMEND"
        ? EthicsWorkflowStage.COORDINATOR_RECORD
        : EthicsWorkflowStage.STUDENT_DECLARATION;
    const updated = await tx.ethicsApproval.update({
      where: { id: record.id },
      data: {
        workflowStage: nextStage,
        status:
          input.decision === "RECOMMEND"
            ? EthicsRecordStatus.PENDING
            : EthicsRecordStatus.NOT_RECORDED,
        supervisorRecommendedAt:
          input.decision === "RECOMMEND" ? new Date() : null,
        notes,
      },
    });

    await tx.ethicsWorkflowDecision.create({
      data: {
        ethicsApprovalId: record.id,
        stage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
        action:
          input.decision === "RECOMMEND"
            ? EthicsWorkflowAction.SUPERVISOR_RECOMMENDED
            : EthicsWorkflowAction.SUPERVISOR_RETURNED,
        actorUserId: auth.userId,
        notes,
        metadata: {
          applicability: record.applicability,
          revisionNumber: record.revisionNumber,
        },
      },
    });

    const administrators =
      input.decision === "RECOMMEND"
        ? await listActiveRoleRecipients(tx, UserRole.ADMINISTRATOR)
        : [];
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `ethics:${record.id}:supervisor:${record.revisionNumber}:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.ETHICS_SUPERVISOR_DECIDED,
        aggregateType: "EthicsApproval",
        aggregateId: record.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: record.workflowStage,
        newState: nextStage,
        metadata: { decision: input.decision },
      },
      input.decision === "RETURN"
        ? [
            {
              eventKey: `ethics:${record.id}:supervisor-return:${record.revisionNumber}:student`,
              recipientId: record.student.userId,
              studentId: record.student.id,
              notificationEvent: "ETHICS_APPROVAL_SUBMITTED",
              title: "Ethics declaration returned",
              message:
                notes ??
                "Your Supervisor returned the ethics declaration for revision.",
              actionUrl: "/dashboard/student/ethics",
            },
          ]
        : administrators.map((administrator) => ({
            eventKey: `ethics:${record.id}:supervisor-recommend:${record.revisionNumber}:${administrator.id}`,
            recipientId: administrator.id,
            studentId: record.student.id,
            notificationEvent: "ETHICS_APPROVAL_SUBMITTED" as const,
            title: "Ethics record awaiting PG Coordinator action",
            message:
              "A Supervisor recommendation is ready for Department recording.",
            actionUrl: "/dashboard/admin/ethics",
          })),
    );

    return updated;
  });
}

export async function recordCoordinatorEthicsDecision(
  ethicsRecordId: string,
  input: {
    decision: "RECORD" | "RETURN";
    status?: "APPROVED" | "EXEMPT" | "REJECTED";
    referenceNumber?: string;
    validUntil?: Date;
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new DepartmentEthicsError(
      "Only the PG Coordinator can record the Department ethics status.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const record = await tx.ethicsApproval.findUnique({
      where: { id: ethicsRecordId },
      include: { student: { select: { id: true, userId: true } } },
    });
    if (!record) {
      throw new DepartmentEthicsError("Ethics record not found.", 404);
    }
    if (record.workflowStage !== EthicsWorkflowStage.COORDINATOR_RECORD) {
      throw new DepartmentEthicsError(
        "This ethics record is not awaiting PG Coordinator action.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    if (input.decision === "RECORD") {
      if (!input.status) {
        throw new DepartmentEthicsError(
          "A Department ethics status is required.",
          400,
        );
      }
      if (
        record.applicability === EthicsApplicability.NOT_REQUIRED &&
        input.status !== EthicsRecordStatus.EXEMPT
      ) {
        throw new DepartmentEthicsError(
          "A not-required declaration can only be recorded as exempt.",
          409,
        );
      }
      if (
        record.applicability === EthicsApplicability.REQUIRED &&
        input.status === EthicsRecordStatus.EXEMPT
      ) {
        throw new DepartmentEthicsError(
          "A required ethics case cannot be recorded as exempt.",
          409,
        );
      }
      if (
        input.status === EthicsRecordStatus.APPROVED &&
        !input.referenceNumber?.trim()
      ) {
        throw new DepartmentEthicsError(
          "An approval reference number is required.",
          400,
        );
      }
    }

    const nextStage =
      input.decision === "RECORD"
        ? EthicsWorkflowStage.HOD_CONFIRMATION
        : EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION;
    const updated = await tx.ethicsApproval.update({
      where: { id: record.id },
      data: {
        workflowStage: nextStage,
        status: EthicsRecordStatus.PENDING,
        coordinatorProposedStatus:
          input.decision === "RECORD" ? input.status : null,
        coordinatorRecordedAt:
          input.decision === "RECORD" ? new Date() : null,
        statusRecordedBy: auth.userId,
        statusRecordedAt: new Date(),
        referenceNumber:
          input.decision === "RECORD"
            ? input.referenceNumber?.trim()
            : undefined,
        validUntil:
          input.decision === "RECORD" ? input.validUntil : undefined,
        notes,
      },
    });

    await tx.ethicsWorkflowDecision.create({
      data: {
        ethicsApprovalId: record.id,
        stage: EthicsWorkflowStage.COORDINATOR_RECORD,
        action:
          input.decision === "RECORD"
            ? EthicsWorkflowAction.COORDINATOR_RECORDED
            : EthicsWorkflowAction.COORDINATOR_RETURNED,
        actorUserId: auth.userId,
        notes,
        metadata:
          input.decision === "RECORD" && input.status
            ? {
                proposedStatus: input.status,
                referenceNumber: input.referenceNumber ?? null,
              }
            : undefined,
      },
    });

    const hodUsers =
      input.decision === "RECORD"
        ? await listActiveRoleRecipients(tx, UserRole.HOD)
        : [];
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `ethics:${record.id}:coordinator:${record.revisionNumber}:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.ETHICS_COORDINATOR_DECIDED,
        aggregateType: "EthicsApproval",
        aggregateId: record.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: record.workflowStage,
        newState: nextStage,
        metadata: {
          decision: input.decision,
          proposedStatus: input.status ?? null,
        },
      },
      input.decision === "RECORD"
        ? hodUsers.map((hod) => ({
            eventKey: `ethics:${record.id}:coordinator:${record.revisionNumber}:hod:${hod.id}`,
            recipientId: hod.id,
            studentId: record.student.id,
            notificationEvent: "ETHICS_APPROVAL_SUBMITTED" as const,
            title: "Ethics record awaiting HOD confirmation",
            message:
              "The PG Coordinator recorded an ethics status for confirmation.",
            actionUrl: "/dashboard/hod/ethics",
          }))
        : [
            {
              eventKey: `ethics:${record.id}:coordinator-return:${record.revisionNumber}:student`,
              recipientId: record.student.userId,
              studentId: record.student.id,
              notificationEvent: "ETHICS_APPROVAL_SUBMITTED",
              title: "Ethics record returned",
              message:
                notes ??
                "The PG Coordinator returned the ethics record for further review.",
              actionUrl: "/dashboard/student/ethics",
            },
          ],
    );

    return updated;
  });
}

export async function confirmEthicsByHod(
  ethicsRecordId: string,
  input: {
    decision: "CONFIRM" | "RETURN" | "REJECT";
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new DepartmentEthicsError(
      "Only the HOD can confirm the Department ethics record.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const record = await tx.ethicsApproval.findUnique({
      where: { id: ethicsRecordId },
      include: { student: { select: { id: true, userId: true } } },
    });
    if (!record) {
      throw new DepartmentEthicsError("Ethics record not found.", 404);
    }
    if (record.workflowStage !== EthicsWorkflowStage.HOD_CONFIRMATION) {
      throw new DepartmentEthicsError(
        "This ethics record is not awaiting HOD confirmation.",
        409,
      );
    }
    if (input.decision === "CONFIRM" && !record.coordinatorProposedStatus) {
      throw new DepartmentEthicsError(
        "The PG Coordinator status is missing.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    const nextStage =
      input.decision === "RETURN"
        ? EthicsWorkflowStage.COORDINATOR_RECORD
        : EthicsWorkflowStage.COMPLETED;
    const nextStatus =
      input.decision === "CONFIRM"
        ? (record.coordinatorProposedStatus ?? EthicsRecordStatus.PENDING)
        : input.decision === "REJECT"
          ? EthicsRecordStatus.REJECTED
          : EthicsRecordStatus.PENDING;
    const updated = await tx.ethicsApproval.update({
      where: { id: record.id },
      data: {
        workflowStage: nextStage,
        status: nextStatus,
        hodConfirmedAt:
          input.decision === "RETURN" ? null : new Date(),
        notes,
      },
    });

    await tx.ethicsWorkflowDecision.create({
      data: {
        ethicsApprovalId: record.id,
        stage: EthicsWorkflowStage.HOD_CONFIRMATION,
        action:
          input.decision === "CONFIRM"
            ? EthicsWorkflowAction.HOD_CONFIRMED
            : input.decision === "RETURN"
              ? EthicsWorkflowAction.HOD_RETURNED
              : EthicsWorkflowAction.HOD_REJECTED,
        actorUserId: auth.userId,
        notes,
        metadata: { finalStatus: nextStatus },
      },
    });

    const administrators = await listActiveRoleRecipients(
      tx,
      UserRole.ADMINISTRATOR,
    );
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `ethics:${record.id}:hod:${record.revisionNumber}:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.ETHICS_HOD_DECIDED,
        aggregateType: "EthicsApproval",
        aggregateId: record.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: record.workflowStage,
        newState: nextStage,
        metadata: { decision: input.decision, finalStatus: nextStatus },
      },
      [
        {
          eventKey: `ethics:${record.id}:hod:${record.revisionNumber}:student`,
          recipientId: record.student.userId,
          studentId: record.student.id,
          notificationEvent: "ETHICS_APPROVAL_SUBMITTED",
          title:
            input.decision === "RETURN"
              ? "Ethics record returned by HOD"
              : "Department ethics decision recorded",
          message:
            notes ??
            (input.decision === "RETURN"
              ? "The HOD returned the ethics record to the PG Coordinator."
              : `The Department ethics status is ${nextStatus.toLowerCase()}.`),
          actionUrl: "/dashboard/student/ethics",
        },
        ...administrators.map((administrator) => ({
          eventKey: `ethics:${record.id}:hod:${record.revisionNumber}:admin:${administrator.id}`,
          recipientId: administrator.id,
          studentId: record.student.id,
          notificationEvent: "ETHICS_APPROVAL_SUBMITTED" as const,
          title: "HOD ethics decision recorded",
          message: `The HOD decision is ${input.decision.toLowerCase()}.`,
          actionUrl: "/dashboard/admin/ethics",
        })),
      ],
    );

    return updated;
  });
}

type EthicsReader = Pick<Prisma.TransactionClient, "ethicsApproval">;

export async function assertEthicsGateSatisfied(
  transaction: EthicsReader,
  studentId: string,
) {
  const record = await transaction.ethicsApproval.findFirst({
    where: { studentId, isArchived: false },
    orderBy: { createdAt: "desc" },
  });

  if (
    !record ||
    record.workflowStage !== EthicsWorkflowStage.COMPLETED ||
    (record.applicability === EthicsApplicability.REQUIRED &&
      record.status !== EthicsRecordStatus.APPROVED) ||
    (record.applicability === EthicsApplicability.NOT_REQUIRED &&
      record.status !== EthicsRecordStatus.EXEMPT) ||
    record.applicability === EthicsApplicability.UNDETERMINED
  ) {
    throw new DepartmentEthicsError(
      "The HOD-confirmed Department ethics gate is not satisfied.",
      409,
    );
  }

  if (
    record.status === EthicsRecordStatus.APPROVED &&
    record.validUntil &&
    record.validUntil < new Date()
  ) {
    throw new DepartmentEthicsError("The ethics approval has expired.", 409);
  }

  return record;
}
