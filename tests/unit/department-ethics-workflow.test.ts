import {
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowAction,
  EthicsWorkflowStage,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import {
  confirmEthicsByHod,
  recommendEthicsRecord,
  recordCoordinatorEthicsDecision,
} from "@/lib/ethics/department-record";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

const supervisorAuth: AuthenticatedUserContext = {
  uid: "firebase-supervisor-1",
  firebaseUid: "firebase-supervisor-1",
  userId: "user-supervisor-1",
  role: UserRole.SUPERVISOR,
};

const administratorAuth: AuthenticatedUserContext = {
  uid: "firebase-admin-1",
  firebaseUid: "firebase-admin-1",
  userId: "user-admin-1",
  role: UserRole.ADMINISTRATOR,
};

const hodAuth: AuthenticatedUserContext = {
  uid: "firebase-hod-1",
  firebaseUid: "firebase-hod-1",
  userId: "user-hod-1",
  role: UserRole.HOD,
};

function makeTransaction(record: Record<string, unknown>) {
  return {
    ethicsApproval: {
      findUnique: vi.fn().mockResolvedValue(record),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...record,
          ...data,
        }),
      ),
    },
    ethicsWorkflowDecision: {
      create: vi.fn().mockResolvedValue({ id: "decision-1" }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    lifecycleAuditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    outboxMessage: {
      create: vi.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
}

describe("Department ethics role workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a Supervisor who is not actively assigned to the Student", async () => {
    const transaction = makeTransaction({
      id: "ethics-1",
      revisionNumber: 1,
      applicability: EthicsApplicability.REQUIRED,
      workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
      student: {
        id: "student-1",
        userId: "student-user-1",
        supervisorAssignments: [],
      },
      documents: [{ id: "document-1" }],
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await expect(
      recommendEthicsRecord(
        "ethics-1",
        { decision: "RECOMMEND" },
        supervisorAuth,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "You are not an active Supervisor for this Student.",
    });
  });

  it("moves a verified declaration to the PG Coordinator queue", async () => {
    const transaction = makeTransaction({
      id: "ethics-1",
      revisionNumber: 2,
      applicability: EthicsApplicability.REQUIRED,
      workflowStage: EthicsWorkflowStage.SUPERVISOR_RECOMMENDATION,
      student: {
        id: "student-1",
        userId: "student-user-1",
        supervisorAssignments: [{ id: "assignment-1", isPrimary: true }],
      },
      documents: [{ id: "document-1" }],
    });
    transaction.user.findMany.mockResolvedValue([
      { id: "user-admin-1" },
    ]);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await recommendEthicsRecord(
      "ethics-1",
      { decision: "RECOMMEND", notes: "Evidence is complete." },
      supervisorAuth,
    );

    expect(transaction.ethicsApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: EthicsWorkflowStage.COORDINATOR_RECORD,
          status: EthicsRecordStatus.PENDING,
        }),
      }),
    );
    expect(transaction.ethicsWorkflowDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: EthicsWorkflowAction.SUPERVISOR_RECOMMENDED,
          actorUserId: supervisorAuth.userId,
        }),
      }),
    );
  });

  it("prevents the PG Coordinator from exempting a required case", async () => {
    const transaction = makeTransaction({
      id: "ethics-1",
      revisionNumber: 1,
      applicability: EthicsApplicability.REQUIRED,
      workflowStage: EthicsWorkflowStage.COORDINATOR_RECORD,
      student: {
        id: "student-1",
        userId: "student-user-1",
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await expect(
      recordCoordinatorEthicsDecision(
        "ethics-1",
        { decision: "RECORD", status: "EXEMPT" },
        administratorAuth,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "A required ethics case cannot be recorded as exempt.",
    });
  });

  it("completes the gate only after HOD confirmation", async () => {
    const transaction = makeTransaction({
      id: "ethics-1",
      revisionNumber: 1,
      applicability: EthicsApplicability.REQUIRED,
      status: EthicsRecordStatus.PENDING,
      coordinatorProposedStatus: EthicsRecordStatus.APPROVED,
      workflowStage: EthicsWorkflowStage.HOD_CONFIRMATION,
      student: {
        id: "student-1",
        userId: "student-user-1",
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await confirmEthicsByHod(
      "ethics-1",
      { decision: "CONFIRM", notes: "Confirmed by the HOD." },
      hodAuth,
    );

    expect(transaction.ethicsApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: EthicsWorkflowStage.COMPLETED,
          status: EthicsRecordStatus.APPROVED,
          hodConfirmedAt: expect.any(Date),
        }),
      }),
    );
    expect(transaction.ethicsWorkflowDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: EthicsWorkflowAction.HOD_CONFIRMED,
          actorUserId: hodAuth.userId,
        }),
      }),
    );
  });
});
