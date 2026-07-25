import { ProgramType, RegistrationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    supervisor: {
      findUnique: vi.fn(),
    },
    supervisorAssignment: {
      findMany: vi.fn(),
    },
  },
}));

import { getSupervisorAssignedStudents } from "@/lib/supervisor/students";
import { prisma } from "@/lib/prisma/client";

describe("supervisor student data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limits the result set to students assigned to the logged-in supervisor", async () => {
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "user-supervisor-1",
    } as never);
    vi.mocked(prisma.supervisorAssignment.findMany).mockResolvedValue([
      {
        id: "assignment-1",
        isPrimary: true,
        assignedAt: new Date("2026-05-01T04:00:00.000Z"),
        student: {
          id: "student-1",
          userId: "user-student-1",
          programType: ProgramType.MPHIL,
          academicStatus: "ACTIVE",
          user: {
            displayName: "Student One",
            email: "student1@example.com",
          },
          registrations: [
            {
              id: "registration-1",
              status: RegistrationStatus.ACTIVE,
              startDate: new Date("2026-01-01T00:00:00.000Z"),
              expirationDate: new Date("2026-12-31T00:00:00.000Z"),
            },
          ],
          researchProposals: [
            {
              id: "proposal-1",
              title: "AI in Education",
              status: "UNDER_REVIEW",
              updatedAt: new Date("2026-04-30T10:00:00.000Z"),
            },
          ],
        },
      },
    ] as never);

    const students = await getSupervisorAssignedStudents({
      uid: "firebase-supervisor-1",
      userId: "user-supervisor-1",
      firebaseUid: "firebase-supervisor-1",
      role: "SUPERVISOR",
      email: "supervisor@example.com",
    });

    expect(prisma.supervisorAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          supervisorId: "supervisor-1",
        },
      }),
    );
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      student: {
        id: "student-1",
        displayName: "Student One",
      },
      currentRegistration: {
        status: RegistrationStatus.ACTIVE,
      },
      latestProposal: {
        status: "UNDER_REVIEW",
      },
    });
  });

  it("returns 404 when the supervisor profile cannot be found", async () => {
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue(null as never);

    await expect(
      getSupervisorAssignedStudents({
        uid: "firebase-supervisor-1",
        userId: "user-supervisor-1",
        firebaseUid: "firebase-supervisor-1",
        role: "SUPERVISOR",
        email: "supervisor@example.com",
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Supervisor profile not found.",
    });
  });
});
