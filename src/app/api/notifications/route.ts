import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma/client";
import { withAuth, type WithAuthContext } from "@/lib/firebase/with-auth";

const DEFAULT_LIMIT = 20;

export const GET = withAuth(
  async (request: NextRequest, { auth }: WithAuthContext) => {
    const { searchParams } = request.nextUrl;
    const limit = searchParams.get("limit")
      ? Math.min(Number(searchParams.get("limit")), 100)
      : DEFAULT_LIMIT;
    const unreadOnly = searchParams.get("unread") === "true";

    try {
      const notifications = await prisma.notification.findMany({
        where: {
          recipientId: auth.userId,
          ...(unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          event: true,
          title: true,
          message: true,
          isRead: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ notifications });
    } catch (error) {
      console.error("[GET /api/notifications] Failed to load notifications.", error);
      return NextResponse.json(
        { error: "Unable to retrieve notifications." },
        { status: 500 },
      );
    }
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
    UserRole.HOD,
  ],
);

/**
 * PATCH /api/notifications/[id]/read is intentionally omitted here in favour
 * of a separate sub-route, but a bulk mark-as-read is provided below for
 * dashboard UX convenience.
 */
export const PATCH = withAuth(
  async (request: NextRequest, { auth }: WithAuthContext) => {
    try {
      await prisma.notification.updateMany({
        where: { recipientId: auth.userId, isRead: false },
        data: { isRead: true },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("[PATCH /api/notifications] Failed to mark notifications as read.", error);
      return NextResponse.json(
        { error: "Unable to update notifications." },
        { status: 500 },
      );
    }
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
    UserRole.HOD,
  ],
);
