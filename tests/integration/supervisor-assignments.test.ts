import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
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
    },
  },
}));

import { notifySupervisorAssigned } from "@/lib/email";
import { assignSupervisorToStudent } from "@/lib/assignments/supervisors";
import { prisma } from "@/lib/prisma/client";

describe("supervisor assignment integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a successful primary assignment with the correct flag", async () => {
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
      user: {
        displayName: "Admin One",
      },
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        displayName: "Student One",
      },
      supervisorAssignments: [],
      examinerAssignments: [],
    } as never);
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "user-supervisor-1",
      user: {
        id: "user-supervisor-1",
        displayName: "Supervisor One",
        email: "supervisor1@example.com",
        isActive: true,
      },
    } as never);
    vi.mocked(prisma.supervisorAssignment.create).mockResolvedValue({
      id: "assignment-1",
      studentId: "student-1",
      supervisorId: "supervisor-1",
      supervisorUserId: "user-supervisor-1",
      isPrimary: true,
      assignedAt: new Date("2026-05-01T04:00:00.000Z"),
      assignedBy: "admin-1",
    } as never);

    const result = await assignSupervisorToStudent(
      {
        studentId: "student-1",
        supervisorId: "supervisor-1",
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

    expect(prisma.supervisorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          supervisorId: "supervisor-1",
          isPrimary: true,
          assignedBy: "admin-1",
        }),
      }),
    );
    expect(result).toMatchObject({
      id: "assignment-1",
      studentId: "student-1",
      supervisorId: "supervisor-1",
      isPrimary: true,
      assignedBy: "admin-1",
    });
  });

  it("notifies the supervisor after assignment", async () => {
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
      user: {
        displayName: "Admin One",
      },
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        displayName: "Student One",
      },
      supervisorAssignments: [
        {
          supervisorId: "supervisor-primary-1",
          supervisorUserId: "user-supervisor-primary-1",
          isPrimary: true,
        },
      ],
      examinerAssignments: [],
    } as never);
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "user-supervisor-1",
      user: {
        id: "user-supervisor-1",
        displayName: "Supervisor One",
        email: "supervisor1@example.com",
        isActive: true,
      },
    } as never);
    vi.mocked(prisma.supervisorAssignment.create).mockResolvedValue({
      id: "assignment-1",
      studentId: "student-1",
      supervisorId: "supervisor-1",
      supervisorUserId: "user-supervisor-1",
      isPrimary: false,
      assignedAt: new Date("2026-05-01T04:05:00.000Z"),
      assignedBy: "admin-1",
    } as never);

    await assignSupervisorToStudent(
      {
        studentId: "student-1",
        supervisorId: "supervisor-1",
        isPrimary: false,
      },
      {
        uid: "firebase-admin-1",
        userId: "user-admin-1",
        firebaseUid: "firebase-admin-1",
        role: "ADMINISTRATOR",
        email: "admin@example.com",
      },
    );

    expect(notifySupervisorAssigned).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "user-supervisor-1",
        to: "supervisor1@example.com",
        supervisorName: "Supervisor One",
        studentName: "Student One",
        assignmentRoleLabel: "Co-supervisor",
        assignedByName: "Admin One",
      }),
    );
  });
});
