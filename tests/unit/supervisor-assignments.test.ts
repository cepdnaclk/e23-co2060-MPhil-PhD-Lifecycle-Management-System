import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifySupervisorAssigned: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    administrator: {
      findUnique: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    supervisor: {
      findUnique: vi.fn(),
    },
    supervisorAssignment: {
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { assignSupervisorToStudent } from "@/lib/assignments/supervisors";
import { prisma } from "@/lib/prisma/client";

describe("supervisor assignment rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        supervisorAssignment: {
          create: prisma.supervisorAssignment.create,
          updateMany: prisma.supervisorAssignment.updateMany,
          update: prisma.supervisorAssignment.update,
        },
        lifecycleAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      } as never),
    );

    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
      user: {
        displayName: "Admin One",
      },
    } as never);
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-2",
      userId: "user-supervisor-2",
      user: {
        id: "user-supervisor-2",
        displayName: "Supervisor Two",
        email: "supervisor2@example.com",
        isActive: true,
      },
    } as never);
  });

  it("allows changing the primary supervisor by demoting the existing primary", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        displayName: "Student One",
      },
      supervisorAssignments: [
        {
          id: "assignment-1",
          supervisorId: "supervisor-1",
          supervisorUserId: "user-supervisor-1",
          isPrimary: true,
        },
      ],
      examinerAssignments: [],
    } as never);
    vi.mocked(prisma.supervisorAssignment.create).mockResolvedValue({
      id: "assignment-2",
      studentId: "student-1",
      supervisorId: "supervisor-2",
      supervisorUserId: "user-supervisor-2",
      isPrimary: true,
      assignedAt: new Date("2026-05-01T04:00:00.000Z"),
      assignedBy: "admin-1",
    } as never);

    const result = await assignSupervisorToStudent(
      {
        studentId: "student-1",
        supervisorId: "supervisor-2",
        isPrimary: true,
      },
      {
        uid: "firebase-admin-1",
        userId: "user-admin-1",
        firebaseUid: "firebase-admin-1",
        role: "ADMINISTRATOR",
        email: "admin@example.com",
      },
    );

    expect(prisma.supervisorAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        isPrimary: true,
        effectiveTo: null,
      },
      data: {
        isPrimary: false,
      },
    });
    expect(result).toMatchObject({
      id: "assignment-2",
      isPrimary: true,
    });
  });

  it("blocks assigning a supervisor who is already an examiner for the student", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        displayName: "Student One",
      },
      supervisorAssignments: [
        {
          id: "assignment-1",
          supervisorId: "supervisor-1",
          supervisorUserId: "user-supervisor-1",
          isPrimary: true,
        },
      ],
      examinerAssignments: [
        {
          examinerUserId: "user-supervisor-2",
        },
      ],
    } as never);

    await expect(
      assignSupervisorToStudent(
        {
          studentId: "student-1",
          supervisorId: "supervisor-2",
          isPrimary: false,
        },
        {
          uid: "firebase-admin-1",
          userId: "user-admin-1",
          firebaseUid: "firebase-admin-1",
          role: "ADMINISTRATOR",
          email: "admin@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "A supervisor cannot be assigned when the same user is already an examiner for this student.",
    });
  });
});
