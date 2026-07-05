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

import {
  assignSupervisorToStudent,
  SupervisorAssignmentError,
} from "@/lib/assignments/supervisors";
import { prisma } from "@/lib/prisma/client";

describe("supervisor assignment rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  it("returns a 400 error when a second primary supervisor is assigned", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        displayName: "Student One",
      },
      supervisorAssignments: [
        {
          supervisorId: "supervisor-1",
          supervisorUserId: "user-supervisor-1",
          isPrimary: true,
        },
      ],
      examinerAssignments: [],
    } as never);

    await expect(
      assignSupervisorToStudent(
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
      ),
    ).rejects.toMatchObject<SupervisorAssignmentError>({
      status: 400,
      message: "A student can only have one primary supervisor.",
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
    ).rejects.toMatchObject<SupervisorAssignmentError>({
      status: 400,
      message:
        "A supervisor cannot be assigned when the same user is already an examiner for this student.",
    });
  });
});
