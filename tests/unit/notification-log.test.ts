import { NotificationDeliveryStatus, NotificationEvent } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockLogs } = vi.hoisted(() => ({
  mockLogs: [
    {
      id: "log-1",
      recipientId: "user-1",
      event: "PROGRESS_REPORT_SUBMITTED",
      subject: "Progress report submitted for Q1 2026",
      deliveryStatus: "SENT",
      failureReason: null,
      metadata: { to: "supervisor@example.com" },
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      recipient: { email: "supervisor@example.com", displayName: "Dr. Smith" },
    },
    {
      id: "log-2",
      recipientId: "user-2",
      event: "REGISTRATION_EXPIRY_APPROACHING",
      subject: "Registration expiry reminder: 14 days remaining",
      deliveryStatus: "FAILED",
      failureReason: "ECONNREFUSED",
      metadata: { to: "student@example.com" },
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      updatedAt: new Date("2026-05-01T09:00:00.000Z"),
      recipient: { email: "student@example.com", displayName: "Alice" },
    },
  ],
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    notificationLog: {
      findMany: vi.fn().mockResolvedValue(mockLogs),
      count: vi.fn().mockResolvedValue(2),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
  buildNotificationLogCsv,
  listNotificationLogs,
} from "@/lib/admin/notification-log";
import { prisma } from "@/lib/prisma/client";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listNotificationLogs — filter application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue(mockLogs as never);
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(2);
  });

  it("applies recipientId filter to the Prisma where clause", async () => {
    await listNotificationLogs({ recipientId: "user-1" });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: "user-1" }),
      }),
    );
  });

  it("applies event filter when a valid NotificationEvent is provided", async () => {
    await listNotificationLogs({ event: "PROGRESS_REPORT_SUBMITTED" });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event: NotificationEvent.PROGRESS_REPORT_SUBMITTED,
        }),
      }),
    );
  });

  it("applies status filter when SENT is provided", async () => {
    await listNotificationLogs({ status: "SENT" });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryStatus: NotificationDeliveryStatus.SENT,
        }),
      }),
    );
  });

  it("applies status filter when FAILED is provided", async () => {
    await listNotificationLogs({ status: "FAILED" });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryStatus: NotificationDeliveryStatus.FAILED,
        }),
      }),
    );
  });

  it("ignores an invalid event string and does not filter by event", async () => {
    await listNotificationLogs({ event: "INVALID_EVENT" });

    const callArgs = vi.mocked(prisma.notificationLog.findMany).mock.calls[0]?.[0];
    expect(callArgs?.where).not.toHaveProperty("event");
  });

  it("applies date range filter when startDate and endDate are provided", async () => {
    await listNotificationLogs({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it("returns mapped log items with recipientEmail and recipientName", async () => {
    const result = await listNotificationLogs({});

    expect(result.logs[0]).toMatchObject({
      id: "log-1",
      recipientEmail: "supervisor@example.com",
      recipientName: "Dr. Smith",
      deliveryStatus: NotificationDeliveryStatus.SENT,
    });
  });

  it("returns correct pagination metadata", async () => {
    vi.mocked(prisma.notificationLog.count).mockResolvedValue(120);

    const result = await listNotificationLogs({ page: 2, limit: 50 });

    expect(result.page).toBe(2);
    expect(result.total).toBe(120);
    expect(result.pageCount).toBe(3);
  });

  it("caps pagination to 50 records per page", async () => {
    await listNotificationLogs({ page: 1, limit: 200 });

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        skip: 0,
      }),
    );
  });

  it("orders results by createdAt descending", async () => {
    await listNotificationLogs({});

    expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("builds a CSV export with visible audit columns", async () => {
    const result = await listNotificationLogs({});
    const csv = buildNotificationLogCsv(result.logs);

    expect(csv).toContain(
      "Timestamp,Recipient ID,Recipient Name,Recipient Email,Event,Subject,Delivery Status,Failure Reason",
    );
    expect(csv).toContain("Progress report submitted for Q1 2026");
    expect(csv).toContain("ECONNREFUSED");
  });

  it("is exposed as a read-only service surface from the API route", async () => {
    const route = await import("@/app/api/admin/notification-log/route");

    expect(route.GET).toBeTypeOf("function");
    expect("POST" in route).toBe(false);
    expect("PATCH" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });
});
