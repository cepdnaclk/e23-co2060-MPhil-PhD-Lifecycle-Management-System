import { NextRequest } from "next/server";
import { NotificationDeliveryStatus, NotificationEvent, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    notificationLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "log-1",
          recipientId: "user-supervisor-1",
          event: NotificationEvent.PROGRESS_REPORT_SUBMITTED,
          subject: "Progress report submitted for Q1 2026",
          deliveryStatus: NotificationDeliveryStatus.SENT,
          failureReason: null,
          metadata: { to: "supervisor@example.com" },
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          updatedAt: new Date("2026-05-01T10:00:00.000Z"),
          recipient: { email: "supervisor@example.com", displayName: "Dr. Smith" },
        },
        {
          id: "log-2",
          recipientId: "user-student-1",
          event: NotificationEvent.REGISTRATION_EXPIRY_APPROACHING,
          subject: "Registration expiry reminder: 14 days remaining",
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          failureReason: "ECONNREFUSED",
          metadata: { to: "student@example.com" },
          createdAt: new Date("2026-05-01T09:00:00.000Z"),
          updatedAt: new Date("2026-05-01T09:00:00.000Z"),
          recipient: { email: "student@example.com", displayName: "Alice" },
        },
      ]),
      count: vi.fn().mockResolvedValue(2),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/admin/notification-log/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminAuth = {
  uid: "firebase-admin",
  userId: "user-admin",
  firebaseUid: "firebase-admin",
  role: UserRole.ADMINISTRATOR,
  email: "admin@example.com",
};

const studentAuth = {
  uid: "firebase-student",
  userId: "user-student",
  firebaseUid: "firebase-student",
  role: UserRole.STUDENT,
  email: "student@example.com",
};

function makeGetRequest(params = "") {
  return new NextRequest(`http://localhost/api/admin/notification-log${params}`, {
    method: "GET",
    headers: { authorization: "Bearer admin-token" },
  }) as never;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/notification-log — RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([
      {
        id: "log-1",
        recipientId: "user-supervisor-1",
        event: NotificationEvent.PROGRESS_REPORT_SUBMITTED,
        subject: "Progress report submitted for Q1 2026",
        deliveryStatus: NotificationDeliveryStatus.SENT,
        failureReason: null,
        metadata: { to: "supervisor@example.com" },
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        recipient: { email: "supervisor@example.com", displayName: "Dr. Smith" },
      },
    ] as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(1);
  });

  it("returns 403 when a non-admin role (Student) attempts access", async () => {
    const { AuthError } = await import("@/lib/firebase/auth");
    vi.mocked(authenticateBearerRequest).mockRejectedValue(
      new AuthError("Forbidden.", 403),
    );

    const response = await GET(makeGetRequest(), {} as never);

    expect(response.status).toBe(403);
  });

  it("allows Administrator access and returns logs", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    const response = await GET(makeGetRequest(), {} as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs[0]).toHaveProperty("deliveryStatus");
  });
});

describe("GET /api/admin/notification-log — paginated results sorted by timestamp desc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([
      {
        id: "log-1",
        recipientId: "user-supervisor-1",
        event: NotificationEvent.PROGRESS_REPORT_SUBMITTED,
        subject: "Progress report submitted for Q1 2026",
        deliveryStatus: NotificationDeliveryStatus.SENT,
        failureReason: null,
        metadata: {},
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
        recipient: { email: "supervisor@example.com", displayName: "Dr. Smith" },
      },
      {
        id: "log-2",
        recipientId: "user-student-1",
        event: NotificationEvent.REGISTRATION_EXPIRY_APPROACHING,
        subject: "Registration expiry reminder: 14 days remaining",
        deliveryStatus: NotificationDeliveryStatus.FAILED,
        failureReason: "ECONNREFUSED",
        metadata: {},
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
        updatedAt: new Date("2026-04-30T09:00:00.000Z"),
        recipient: { email: "student@example.com", displayName: "Alice" },
      },
    ] as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(2);
  });

  it("returns logs sorted by createdAt descending", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    await GET(makeGetRequest(), {} as never);

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("returns correct pagination metadata (total, page, pageCount)", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(150);

    const response = await GET(makeGetRequest("?page=2&limit=50"), {} as never);
    const data = await response.json();

    expect(data.page).toBe(2);
    expect(data.total).toBe(150);
    expect(data.pageCount).toBe(3);
  });

  it("caps the limit at 50 records per page", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    await GET(makeGetRequest("?page=1&limit=200"), {} as never);

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
      }),
    );
  });

  it("FAILED logs include failureReason for admin review", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    const response = await GET(makeGetRequest(), {} as never);
    const data = await response.json();

    const failedLog = data.logs.find(
      (l: { deliveryStatus: string }) => l.deliveryStatus === "FAILED",
    );
    expect(failedLog).toBeDefined();
    expect(failedLog.failureReason).toBe("ECONNREFUSED");
  });

  it("exports the filtered page as CSV for audit review", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    const response = await GET(makeGetRequest("?format=csv"), {} as never);
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(csv).toContain("Timestamp,Recipient ID,Recipient Name");
    expect(csv).toContain("Progress report submitted for Q1 2026");
  });
});

describe("GET /api/admin/notification-log — filter by recipientId (student ID)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([
      {
        id: "log-2",
        recipientId: "user-student-1",
        event: NotificationEvent.REGISTRATION_EXPIRY_APPROACHING,
        subject: "Registration expiry reminder: 14 days remaining",
        deliveryStatus: NotificationDeliveryStatus.SENT,
        failureReason: null,
        metadata: {},
        createdAt: new Date("2026-04-30T09:00:00.000Z"),
        updatedAt: new Date("2026-04-30T09:00:00.000Z"),
        recipient: { email: "student@example.com", displayName: "Alice" },
      },
    ] as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(1);
  });

  it("passes recipientId filter to Prisma query when provided", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    await GET(makeGetRequest("?recipientId=user-student-1"), {} as never);

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: "user-student-1" }),
      }),
    );
  });

  it("returns only logs for the specified student", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue(adminAuth as never);

    const response = await GET(makeGetRequest("?recipientId=user-student-1"), {} as never);
    const data = await response.json();

    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].recipientId).toBe("user-student-1");
  });
});

describe("GET /api/admin/notification-log — read-only enforcement", () => {
  it("does not export mutation handlers for audit records", async () => {
    const route = await import("@/app/api/admin/notification-log/route");

    expect(route.GET).toBeTypeOf("function");
    expect("POST" in route).toBe(false);
    expect("PATCH" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });
});
