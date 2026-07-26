import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
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
    supervisor: {
      findFirst: vi.fn(),
    },
    supervisorAssignment: {
      findFirst: vi.fn(),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "notif-1",
          event: "PROGRESS_REPORT_SUBMITTED",
          title: "Progress report submitted: Q1 2026",
          message: "Alice has submitted a progress report for Q1 2026.",
          isRead: false,
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
        },
      ]),
      create: vi.fn().mockResolvedValue({ id: "notif-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notificationLog: {
      create: vi.fn().mockResolvedValue({ id: "log-1" }),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  notifyProgressReportSubmitted: vi.fn().mockResolvedValue({ success: true }),
  notifyApplicationStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalStatusChange: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyThesisArchived: vi.fn().mockResolvedValue({ success: true }),
  notifyVivaScheduled: vi.fn().mockResolvedValue({ success: true }),
  notifyCorrectionSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { GET, PATCH } from "@/app/api/notifications/route";
import { notifyProgressReportSubmitted } from "@/lib/email";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";

function makeRequest(method = "GET", url = "http://localhost/api/notifications") {
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer token" },
  }) as never;
}

const supervisorAuth = {
  uid: "firebase-supervisor-1",
  userId: "user-supervisor-1",
  firebaseUid: "firebase-supervisor-1",
  role: UserRole.SUPERVISOR,
  email: "supervisor@example.com",
};

describe("GET /api/notifications - in-app display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the authenticated user's notifications", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(supervisorAuth as never);

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.notifications)).toBe(true);
    expect(data.notifications[0]).toHaveProperty("title");
  });

  it("filters by recipientId of the authenticated user", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(supervisorAuth as never);

    await GET(makeRequest());

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: supervisorAuth.userId }),
      }),
    );
  });
});

describe("PATCH /api/notifications - bulk mark as read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks all unread notifications as read for the current user", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(supervisorAuth as never);

    const response = await PATCH(makeRequest("PATCH"));

    expect(response.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: supervisorAuth.userId, isRead: false },
        data: { isRead: true },
      }),
    );
  });
});

describe("Integration: progress report submission triggers supervisor notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends email to the primary supervisor when a progress report is submitted", async () => {
    await notify({
      event: "PROGRESS_REPORT_SUBMITTED",
      recipientUserId: "user-supervisor-1",
      to: "supervisor@example.com",
      supervisorName: "Dr. Smith",
      studentName: "Alice",
      studentId: "student-1",
      periodLabel: "Q1 2026",
    });

    expect(notifyProgressReportSubmitted).toHaveBeenCalledOnce();
    expect(notifyProgressReportSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "supervisor@example.com",
        supervisorName: "Dr. Smith",
        studentName: "Alice",
        periodLabel: "Q1 2026",
      }),
    );
  });

  it("records an in-app notification for the supervisor", async () => {
    await notify({
      event: "PROGRESS_REPORT_SUBMITTED",
      recipientUserId: "user-supervisor-1",
      to: "supervisor@example.com",
      supervisorName: "Dr. Smith",
      studentName: "Alice",
      studentId: "student-1",
      periodLabel: "Q1 2026",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "user-supervisor-1",
          studentId: "student-1",
        }),
      }),
    );
  });
});

describe("Integration: notification delivery failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when SMTP delivery fails and still records the in-app notification", async () => {
    vi.mocked(notifyProgressReportSubmitted).mockResolvedValueOnce({
      success: false,
      error: "ECONNREFUSED",
    });

    await expect(
      notify({
        event: "PROGRESS_REPORT_SUBMITTED",
        recipientUserId: "user-supervisor-1",
        to: "supervisor@example.com",
        supervisorName: "Dr. Smith",
        studentName: "Alice",
        studentId: "student-1",
        periodLabel: "Q1 2026",
      }),
    ).resolves.toBeUndefined();

    expect(prisma.notification.create).toHaveBeenCalledOnce();
  });
});
