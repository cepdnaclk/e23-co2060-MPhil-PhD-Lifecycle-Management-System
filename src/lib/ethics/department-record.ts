import {
  EthicsApplicability,
  EthicsRecordStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import {
  appendLifecycleEvent,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentEthicsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentEthicsError";
    this.status = status;
  }
}

async function assertCanRecordApplicability(
  studentId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role === UserRole.ADMINISTRATOR || auth.role === UserRole.HOD) {
    return;
  }

  if (auth.role !== UserRole.SUPERVISOR) {
    throw new DepartmentEthicsError(
      "Only Department staff can record ethics applicability.",
      403,
    );
  }

  const activeAssignment = await prisma.supervisorAssignment.findFirst({
    where: {
      studentId,
      supervisorUserId: auth.userId,
      effectiveTo: null,
    },
    select: { id: true },
  });

  if (!activeAssignment) {
    throw new DepartmentEthicsError(
      "You are not an active supervisor for this student.",
      403,
    );
  }
}

export async function recordEthicsApplicability(
  studentId: string,
  applicability: "REQUIRED" | "NOT_REQUIRED",
  notes: string | undefined,
  auth: AuthenticatedUserContext,
) {
  await assertCanRecordApplicability(studentId, auth);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.ethicsApproval.findFirst({
      where: { studentId, isArchived: false },
      orderBy: { createdAt: "desc" },
    });
    const status =
      applicability === EthicsApplicability.NOT_REQUIRED
        ? EthicsRecordStatus.EXEMPT
        : EthicsRecordStatus.PENDING;
    const record = existing
      ? await tx.ethicsApproval.update({
          where: { id: existing.id },
          data: {
            applicability,
            status,
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: new Date(),
            notes,
          },
        })
      : await tx.ethicsApproval.create({
          data: {
            studentId,
            title: "Department ethics record",
            summary: notes ?? "Ethics applicability recorded by the Department.",
            applicability,
            status,
            applicabilityRecordedBy: auth.userId,
            applicabilityRecordedAt: new Date(),
            notes,
          },
        });

    await appendLifecycleEvent(tx as never, {
      eventKey: `ethics:${record.id}:applicability:${applicability.toLowerCase()}`,
      eventType: LIFECYCLE_EVENT.ETHICS_APPLICABILITY_RECORDED,
      aggregateType: "EthicsApproval",
      aggregateId: record.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: existing?.applicability ?? EthicsApplicability.UNDETERMINED,
      newState: applicability,
      metadata: { studentId },
    });

    return record;
  });
}

export async function recordEthicsStatus(
  ethicsRecordId: string,
  input: {
    status:
      | "APPROVED"
      | "REJECTED"
      | "EXPIRED";
    referenceNumber?: string;
    validUntil?: Date;
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.ADMINISTRATOR && auth.role !== UserRole.HOD) {
    throw new DepartmentEthicsError(
      "Only the PG Coordinator or HOD can record ethics status.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.ethicsApproval.findUnique({
      where: { id: ethicsRecordId },
    });

    if (!record) {
      throw new DepartmentEthicsError("Ethics record not found.", 404);
    }

    if (record.applicability !== EthicsApplicability.REQUIRED) {
      throw new DepartmentEthicsError(
        "A formal ethics status applies only when ethics is required.",
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

    const updated = await tx.ethicsApproval.update({
      where: { id: record.id },
      data: {
        status: input.status,
        referenceNumber: input.referenceNumber,
        validUntil: input.validUntil,
        notes: input.notes,
        statusRecordedBy: auth.userId,
        statusRecordedAt: new Date(),
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `ethics:${record.id}:status:${input.status.toLowerCase()}:${Date.now()}`,
      eventType: LIFECYCLE_EVENT.ETHICS_STATUS_RECORDED,
      aggregateType: "EthicsApproval",
      aggregateId: record.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: record.status,
      newState: input.status,
    });

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
    (record.applicability === EthicsApplicability.REQUIRED &&
      record.status !== EthicsRecordStatus.APPROVED) ||
    (record.applicability === EthicsApplicability.NOT_REQUIRED &&
      record.status !== EthicsRecordStatus.EXEMPT) ||
    record.applicability === EthicsApplicability.UNDETERMINED
  ) {
    throw new DepartmentEthicsError(
      "The Department ethics gate is not satisfied.",
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
