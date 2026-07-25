import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/review-panels/workflow", () => ({
  forwardSignedOffProgressReportToPanel: vi.fn().mockResolvedValue({
    forwardedToPanel: false,
    notifiedPanelMembers: 0,
    reviewPanelId: null,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    supervisor: {
      findUnique: vi.fn(),
    },
    panelEvaluation: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    student: {
      update: vi.fn(),
    },
  },
}));

import {
  hasTwoConsecutiveFailingEvaluations,
  submitPanelEvaluation,
} from "@/lib/review-panels";
import { prisma } from "@/lib/prisma/client";

describe("review panel workflow rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      user: {
        displayName: "Dr. Panel",
      },
    } as never);
  });

  it("does not calculate retired supervisor panel outcomes", () => {
    expect(
      hasTwoConsecutiveFailingEvaluations(),
    ).toBe(false);

    expect(
      hasTwoConsecutiveFailingEvaluations(),
    ).toBe(false);
  });

  it("rejects panel evaluation submission because supervisor panels are retired", async () => {
    vi.mocked(prisma.panelEvaluation.findFirst).mockResolvedValue({
      id: "evaluation-1",
      reviewPanelId: "panel-1",
      progressReportId: "report-1",
      progressReport: {
        id: "report-1",
        isSupervisorSignedOff: false,
        studentId: "student-1",
      },
    } as never);

    await expect(
      submitPanelEvaluation(
        {
          progressReportId: "report-1",
          notes: "Serious concerns remain.",
        },
        {
          uid: "firebase-supervisor-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          role: "SUPERVISOR",
          email: "panel@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 410,
      message:
        "Supervisor review panels have been replaced by examiner review assignments.",
    });
  });
});
