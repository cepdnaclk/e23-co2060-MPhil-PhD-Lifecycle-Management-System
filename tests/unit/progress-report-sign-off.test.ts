import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProgressReportSignedOff: vi.fn().mockResolvedValue({
    success: true,
  }),
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
  ProgressReportSignOffError,
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

  it("allows only the assigned primary supervisor to sign off", async () => {
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
    ).rejects.toMatchObject<ProgressReportSignOffError>({
      status: 403,
      message: "Only the assigned primary supervisor can sign off this progress report.",
    });
  });

  it("prevents forwarding to the panel before supervisor sign-off", async () => {
    await expect(
      forwardProgressReportToPanel({
        report: {
          periodLabel: "2026 Q1",
          isSupervisorSignedOff: false,
          student: {
            user: {
              displayName: "Student One",
            },
          },
        },
        supervisorName: "Dr. Primary",
      }),
    ).rejects.toMatchObject<ProgressReportSignOffError>({
      status: 409,
      message: "Progress reports can only be forwarded after supervisor sign-off.",
    });
  });
});
