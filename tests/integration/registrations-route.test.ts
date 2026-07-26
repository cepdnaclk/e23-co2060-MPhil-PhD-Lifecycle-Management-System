import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcademicStatus, MilestoneStatus } from "@prisma/client";

vi.mock("@/lib/firebase/auth", () => ({
  authenticateBearerRequest: vi.fn(),
  AuthError: class AuthError extends Error {
    status: 401 | 403;

    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/student/progress-reports/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("student fixed-milestone registration access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a lapsed student from progress report routes", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-lapsed",
      userId: "user-student-lapsed",
      firebaseUid: "firebase-student-lapsed",
      email: "lapsed@student.example",
      role: "STUDENT",
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-lapsed",
      academicStatus: AcademicStatus.ACTIVE,
      registrations: [],
      milestones: [],
    } as never);

    const response = await GET(
      new Request("http://localhost/api/student/progress-reports", {
        headers: {
          authorization: "Bearer lapsed-student-token",
        },
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "An active Student record and fixed-term registration are required.",
    });
  });

  it("allows an actively registered student to access progress report routes", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-active",
      userId: "user-student-active",
      firebaseUid: "firebase-student-active",
      email: "active@student.example",
      role: "STUDENT",
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-active",
      academicStatus: AcademicStatus.ACTIVE,
      registrations: [{ id: "registration-active-1" }],
      milestones: [
        {
          id: "milestone-1",
          sequenceNumber: 1,
          dueDate: new Date("2026-07-01T00:00:00.000Z"),
          status: MilestoneStatus.DUE,
          completedAt: null,
          progressReport: null,
        },
      ],
    } as never);

    const response = await GET(
      new Request("http://localhost/api/student/progress-reports", {
        headers: {
          authorization: "Bearer active-student-token",
        },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      isActive: true,
      milestones: [
        {
          id: "milestone-1",
          sequenceNumber: 1,
        },
      ],
    });
  });
});
