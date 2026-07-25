import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
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
    supervisor: {
      findUnique: vi.fn(),
    },
    progressReport: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  forwardProgressReportToPanel,
  signOffProgressReport,
} from "@/lib/progress-reports/sign-off";
import { prisma } from "@/lib/prisma/client";

describe("progress report sign-off rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      user: {
        displayName: "Dr. Primary",
      },
    } as never);
  });

  it("rejects supervisor sign-off because supervisors can only monitor reports", async () => {
    vi.mocked(prisma.progressReport.findUnique).mockResolvedValue({
      id: "report-1",
      studentId: "student-1",
      periodLabel: "2026 Q1",
      isSupervisorSignedOff: false,
      supervisorSignedOffAt: null,
      student: {
        id: "student-1",
        user: {
          displayName: "Student One",
        },
        supervisorAssignments: [
          {
            supervisorId: "supervisor-1",
            isPrimary: false,
          },
        ],
      },
    } as never);

    await expect(
      signOffProgressReport(
        {
          id: "report-1",
        },
        {
          uid: "firebase-supervisor-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          role: "SUPERVISOR",
          email: "primary@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 410,
      message:
        "Supervisor progress-report sign-off has been removed. Supervisors can view and monitor submitted reports only.",
    });
  });

  it("rejects forwarding progress reports to retired supervisor panels", async () => {
    await expect(
      forwardProgressReportToPanel(),
    ).rejects.toMatchObject({
      status: 410,
      message:
        "Supervisor progress-report sign-off has been removed. Supervisors can view and monitor submitted reports only.",
    });
  });
});
