import { AcademicStatus, ProgramType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    progressReport: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    application: {
      count: vi.fn(),
    },
    thesis: {
      count: vi.fn(),
    },
    notificationLog: {
      count: vi.fn(),
    },
    ethicsApproval: {
      count: vi.fn(),
    },
  },
}));

import { GET as getOverdueProgress } from "@/app/api/admin/reports/overdue-progress/route";
import { GET as getStudentsUnderReview } from "@/app/api/admin/students/under-review/route";
import { getDashboardSummaryForUser } from "@/lib/dashboard/summary";
import { authenticateBearerRequest, AuthError } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("admin progress monitoring routes", () => {
  let studentsUnderReviewCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    studentsUnderReviewCount = 0;

    vi.mocked(prisma.user.count).mockResolvedValue(6 as never);
    vi.mocked(prisma.application.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.thesis.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.ethicsApproval.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.progressReport.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.student.count).mockImplementation(async () => studentsUnderReviewCount as never);
    vi.mocked(prisma.student.update).mockImplementation(async () => {
      studentsUnderReviewCount = 1;
      return {
        id: "student-1",
        academicStatus: AcademicStatus.UNDER_REVIEW,
      } as never;
    });
  });

  it("returns 403 for student and supervisor access to monitoring endpoints", async () => {
    vi.mocked(authenticateBearerRequest).mockRejectedValue(
      new AuthError("Forbidden.", 403),
    );

    const overdueResponse = await getOverdueProgress(
      new Request("http://localhost/api/admin/reports/overdue-progress", {
        headers: {
          authorization: "Bearer student-token",
        },
      }) as never,
    );
    const underReviewResponse = await getStudentsUnderReview(
      new Request("http://localhost/api/admin/students/under-review", {
        headers: {
          authorization: "Bearer supervisor-token",
        },
      }) as never,
    );

    expect(overdueResponse.status).toBe(403);
    expect(underReviewResponse.status).toBe(403);
  });

  it("updates dashboard metrics immediately after a student is marked under review", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      role: "ADMINISTRATOR",
      email: "admin@example.com",
    } as never);
    vi.mocked(prisma.progressReport.findMany).mockResolvedValue([
      {
        id: "report-1",
        periodLabel: "2026 Q1",
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
        student: {
          id: "student-1",
          programType: ProgramType.MPHIL,
          user: {
            displayName: "Student One",
          },
          supervisorAssignments: [
            {
              supervisorId: "supervisor-1",
              supervisor: {
                user: {
                  displayName: "Dr. Primary",
                },
              },
            },
          ],
        },
      },
    ] as never);
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      {
        id: "student-1",
        programType: ProgramType.MPHIL,
        academicStatus: AcademicStatus.UNDER_REVIEW,
        enrollmentDate: new Date("2025-01-15T00:00:00.000Z"),
        user: {
          displayName: "Student One",
          email: "student1@example.com",
        },
        supervisorAssignments: [
          {
            supervisorId: "supervisor-1",
            supervisor: {
              user: {
                displayName: "Dr. Primary",
              },
            },
          },
        ],
      },
    ] as never);

    await prisma.student.update({
      where: { id: "student-1" },
      data: { academicStatus: AcademicStatus.UNDER_REVIEW },
    } as never);

    const summary = await getDashboardSummaryForUser(
      {
        uid: "firebase-admin-1",
        userId: "user-admin-1",
        firebaseUid: "firebase-admin-1",
        role: "ADMINISTRATOR",
        email: "admin@example.com",
      },
      "admin",
    );

    expect(summary.cards).toContainEqual(
      expect.objectContaining({
        id: "admin-students-under-review",
        value: "1",
      }),
    );
    expect(summary.cards).toContainEqual(
      expect.objectContaining({
        id: "admin-overdue-progress-reports",
        value: "3",
      }),
    );
  });
});
