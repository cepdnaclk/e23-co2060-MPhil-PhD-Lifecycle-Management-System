import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  buildNotificationLogCsv,
  listNotificationLogs,
} from "@/lib/admin/notification-log";
import { withAuth } from "@/lib/firebase/with-auth";

/**
 * GET /api/admin/notification-log
 *
 * Read-only. ADMINISTRATOR only.
 * Supports query params: recipientId, event, status, startDate, endDate, page, limit.
 *
 * Add `format=csv` to export the current filtered page for audit review.
 *
 * POST / PATCH / DELETE are intentionally NOT defined here — the NotificationLog
 * entity is immutable for audit integrity (REQ-FN-020).
 */
export const GET = withAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const requestedLimit = Number(searchParams.get("limit") ?? "50");
  const format = searchParams.get("format");

  const query = {
    recipientId: searchParams.get("recipientId") ?? undefined,
    event: searchParams.get("event") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    limit:
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 50)
        : 50,
  };

  try {
    const result = await listNotificationLogs(query);

    if (format === "csv") {
      return new Response(buildNotificationLogCsv(result.logs), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="notification-log.csv"',
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/notification-log] Error retrieving logs.", error);
    return NextResponse.json(
      { error: "Unable to retrieve notification logs." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
