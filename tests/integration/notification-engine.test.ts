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
    registration: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
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
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyRegistrationExpiry: vi.fn().mockResolvedValue({ success: true }),
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
import { runRegistrationMaintenance } from "@/lib/registrations";

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

    const response = await GET(makeRequest(), { auth: supervisorAuth });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.notifications)).toBe(true);
    expect(data.notifications[0]).toHaveProperty("title");
  });

  it("filters by recipientId of the authenticated user", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(supervisorAuth as never);

    await GET(makeRequest(), { auth: supervisorAuth });

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

    const response = await PATCH(makeRequest("PATCH"), { auth: supervisorAuth });

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

describe("Integration: 14-day registration expiry maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies registrations expiring in 14 days and dispatches reminders", async () => {
    vi.mocked(prisma.registration.findMany).mockResolvedValueOnce([
      {
        id: "reg-1",
        expirationDate: new Date("2026-05-15T00:00:00.000Z"),
        student: {
          user: {
            id: "user-student-1",
            email: "student@example.com",
            displayName: "Alice",
          },
        },
      },
    ] as never);

    const result = await runRegistrationMaintenance(
      new Date("2026-05-01T00:00:00.000Z"),
    );

    expect(result.reminderCount).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "user-student-1",
          event: "REGISTRATION_EXPIRY_APPROACHING",
        }),
      }),
    );
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
