/**
 * Admin Notification Log — PB-071
 *
 * Read-only service for querying the NotificationLog table.
 * Supports filtering by date range, recipient, event type, and delivery status.
 * Offset pagination — 50 records per page by default.
 */

import {
  NotificationDeliveryStatus,
  NotificationEvent,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NOTIFICATION_LOG_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationLogQuery = {
  recipientId?: string;
  event?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export type NotificationLogItem = {
  id: string;
  recipientId: string;
  recipientEmail: string | null;
  recipientName: string;
  event: NotificationEvent;
  subject: string;
  deliveryStatus: NotificationDeliveryStatus;
  failureReason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type NotificationLogPage = {
  logs: NotificationLogItem[];
  total: number;
  page: number;
  pageCount: number;
};

function escapeCsvField(value: string | number | null) {
  const text = value === null ? "" : String(value);

  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

export function buildNotificationLogCsv(logs: NotificationLogItem[]) {
  const headers = [
    "Timestamp",
    "Recipient ID",
    "Recipient Name",
    "Recipient Email",
    "Event",
    "Subject",
    "Delivery Status",
    "Failure Reason",
  ];

  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.recipientId,
    log.recipientName,
    log.recipientEmail,
    log.event,
    log.subject,
    log.deliveryStatus,
    log.failureReason,
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function listNotificationLogs(
  query: NotificationLogQuery,
): Promise<NotificationLogPage> {
  const {
    recipientId,
    event,
    status,
    startDate,
    endDate,
    page = 1,
    limit = NOTIFICATION_LOG_PAGE_SIZE,
  } = query;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), NOTIFICATION_LOG_PAGE_SIZE)
      : NOTIFICATION_LOG_PAGE_SIZE;

  // Build WHERE clause
  const where: Prisma.NotificationLogWhereInput = {};

  if (recipientId) {
    where.recipientId = recipientId;
  }

  if (event) {
    const validEvents = Object.values(NotificationEvent) as string[];
    if (validEvents.includes(event)) {
      where.event = event as NotificationEvent;
    }
  }

  if (status) {
    const validStatuses = Object.values(NotificationDeliveryStatus) as string[];
    if (validStatuses.includes(status)) {
      where.deliveryStatus = status as NotificationDeliveryStatus;
    }
  }

  if (startDate ?? endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const skip = (safePage - 1) * safeLimit;

  const [rawLogs, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip,
      include: {
        recipient: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.notificationLog.count({ where }),
  ]);

  const logs: NotificationLogItem[] = rawLogs.map((log) => ({
    id: log.id,
    recipientId: log.recipientId,
    recipientEmail: log.recipient.email,
    recipientName: log.recipient.displayName,
    event: log.event,
    subject: log.subject,
    deliveryStatus: log.deliveryStatus,
    failureReason: log.failureReason,
    metadata: log.metadata,
    createdAt: log.createdAt,
  }));

  return {
    logs,
    total,
    page: safePage,
    pageCount: Math.ceil(total / safeLimit),
  };
}
