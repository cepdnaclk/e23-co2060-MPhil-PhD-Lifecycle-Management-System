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

vi.mock("@/lib/review-panels/workflow", () => ({
  forwardSignedOffProgressReportToPanel: vi.fn().mockResolvedValue({
    forwardedToPanel: false,
    notifiedPanelMembers: 0,
    reviewPanelId: null,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    administrator: {
      findUnique: vi.fn(),
    },
    supervisor: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    reviewPanelStudentAssignment: {
      findMany: vi.fn(),
    },
    reviewPanel: {
      create: vi.fn(),
    },
    progressReport: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    panelEvaluation: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
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

import { POST as createReviewPanelRoute } from "@/app/api/review-panels/route";
import { getDashboardSummaryForUser } from "@/lib/dashboard/summary";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";
import { submitPanelEvaluation } from "@/lib/review-panels";

describe("review panel management and dashboard integration", () => {
  let studentsUnderReview = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    studentsUnderReview = 0;

    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      role: "ADMINISTRATOR",
      email: "admin@example.com",
    } as never);

    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
    } as never);
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      user: {
        displayName: "Dr. Panel One",
      },
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(8 as never);
    vi.mocked(prisma.application.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.thesis.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.ethicsApproval.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.progressReport.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.student.count).mockImplementation(async () => studentsUnderReview as never);
    vi.mocked(prisma.student.update).mockImplementation(async () => {
      studentsUnderReview = 1;
      return {
        id: "student-1",
        academicStatus: "UNDER_REVIEW",
      } as never;
    });
  });

  it("stores the designated supervisor ids when an administrator creates a review panel", async () => {
    vi.mocked(prisma.supervisor.findMany).mockResolvedValue([
      { id: "supervisor-1" },
      { id: "supervisor-2" },
    ] as never);
    vi.mocked(prisma.student.findMany).mockResolvedValue([{ id: "student-1" }] as never);
    vi.mocked(prisma.reviewPanelStudentAssignment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.reviewPanel.create).mockResolvedValue({
      id: "panel-1",
      name: "Panel Alpha",
      description: "Quarterly review panel",
      cohortProgramType: null,
      memberships: [
        { supervisorId: "supervisor-1" },
        { supervisorId: "supervisor-2" },
      ],
      studentAssignments: [{ studentId: "student-1" }],
    } as never);
    vi.mocked(prisma.progressReport.findMany).mockResolvedValue([] as never);

    const response = await createReviewPanelRoute(
      new Request("http://localhost/api/review-panels", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Panel Alpha",
          description: "Quarterly review panel",
          supervisorIds: ["supervisor-1", "supervisor-2"],
          studentIds: ["student-1"],
        }),
      }) as never,
      {},
    );

    expect(response.status).toBe(201);
    expect(prisma.reviewPanel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberships: {
            create: [
              { supervisorId: "supervisor-1" },
              { supervisorId: "supervisor-2" },
            ],
          },
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      panel: expect.objectContaining({
        id: "panel-1",
        memberships: [
          { supervisorId: "supervisor-1" },
          { supervisorId: "supervisor-2" },
        ],
      }),
    });
  });

  it("increments the admin under-review KPI after a second consecutive failing panel evaluation", async () => {
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      user: {
        displayName: "Dr. Panel One",
      },
    } as never);
    vi.mocked(prisma.panelEvaluation.findFirst).mockResolvedValue({
      id: "evaluation-2",
      reviewPanelId: "panel-1",
      progressReportId: "report-2",
      score: null,
      progressReport: {
        id: "report-2",
        isSupervisorSignedOff: true,
        studentId: "student-1",
      },
    } as never);
    vi.mocked(prisma.panelEvaluation.update).mockResolvedValue({
      id: "evaluation-2",
      reviewPanelId: "panel-1",
      progressReportId: "report-2",
      supervisorId: "supervisor-1",
      score: 45,
      outcome: "FAIL",
      notes: "Still not meeting the expected standard.",
      submittedAt: new Date("2026-05-01T11:00:00.000Z"),
    } as never);
    vi.mocked(prisma.panelEvaluation.findMany).mockResolvedValue([
      { score: 47 },
      { score: 45 },
    ] as never);

    const result = await submitPanelEvaluation(
        {
          progressReportId: "report-2",
          numericalScore: 45,
          outcome: "FAIL",
          notes: "Still not meeting the expected standard.",
        },
      {
        uid: "firebase-supervisor-1",
        userId: "user-supervisor-1",
        firebaseUid: "firebase-supervisor-1",
        role: "SUPERVISOR",
        email: "panel1@example.com",
      },
    );

    expect(result.underReviewTriggered).toBe(true);

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
  });
});
