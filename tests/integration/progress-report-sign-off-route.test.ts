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

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProgressReportSignedOff: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/review-panels/workflow", () => ({
  forwardSignedOffProgressReportToPanel: vi.fn(),
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

import { PATCH } from "@/app/api/progress-reports/[id]/sign-off/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { notifyProgressReportSignedOff } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import { forwardSignedOffProgressReportToPanel } from "@/lib/review-panels/workflow";

describe("progress report sign-off route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-supervisor-1",
      userId: "user-supervisor-1",
      firebaseUid: "firebase-supervisor-1",
      role: "SUPERVISOR",
    } as never);
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      user: {
        displayName: "Dr. Primary",
      },
    } as never);
    vi.mocked(forwardSignedOffProgressReportToPanel).mockResolvedValue({
      forwardedToPanel: false,
      notifiedPanelMembers: 0,
      reviewPanelId: null,
    } as never);
  });

  it("updates the sign-off flag and timestamp on a successful patch", async () => {
    const signedOffAt = new Date("2026-05-01T09:15:00.000Z");

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
            isPrimary: true,
          },
        ],
      },
    } as never);
    vi.mocked(prisma.progressReport.update).mockResolvedValue({
      id: "report-1",
      studentId: "student-1",
      periodLabel: "2026 Q1",
      isSupervisorSignedOff: true,
      supervisorSignedOffAt: signedOffAt,
      supervisorSignedOffById: "supervisor-1",
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/progress-reports/report-1/sign-off", {
        method: "PATCH",
        headers: {
          authorization: "Bearer supervisor-token",
        },
      }) as never,
      {
        params: {
          id: "report-1",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(prisma.progressReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "report-1",
        },
        data: expect.objectContaining({
          isSupervisorSignedOff: true,
          supervisorSignedOffById: "supervisor-1",
          supervisorSignedOffAt: expect.any(Date),
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      report: expect.objectContaining({
        id: "report-1",
        isSupervisorSignedOff: true,
        supervisorSignedOffById: "supervisor-1",
      }),
      forwardedToPanel: false,
      notifiedPanelMembers: 0,
    });
  });

  it("notifies panel members only after sign-off is completed", async () => {
    vi.mocked(prisma.progressReport.findUnique).mockResolvedValue({
      id: "report-2",
      studentId: "student-2",
      periodLabel: "2026 Q2",
      isSupervisorSignedOff: false,
      supervisorSignedOffAt: null,
      student: {
        id: "student-2",
        user: {
          displayName: "Student Two",
        },
        supervisorAssignments: [
          {
            supervisorId: "supervisor-1",
            isPrimary: true,
          },
        ],
      },
    } as never);
    vi.mocked(prisma.progressReport.update).mockResolvedValue({
      id: "report-2",
      studentId: "student-2",
      periodLabel: "2026 Q2",
      isSupervisorSignedOff: true,
      supervisorSignedOffAt: new Date("2026-05-01T10:00:00.000Z"),
      supervisorSignedOffById: "supervisor-1",
    } as never);
    vi.mocked(forwardSignedOffProgressReportToPanel).mockResolvedValue({
      forwardedToPanel: true,
      notifiedPanelMembers: 1,
      reviewPanelId: "panel-1",
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/progress-reports/report-2/sign-off", {
        method: "PATCH",
        headers: {
          authorization: "Bearer supervisor-token",
        },
      }) as never,
      {
        params: {
          id: "report-2",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(forwardSignedOffProgressReportToPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        progressReportId: "report-2",
        supervisorName: "Dr. Primary",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      forwardedToPanel: true,
      notifiedPanelMembers: 1,
    });
  });
});
