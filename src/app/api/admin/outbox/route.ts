import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { listOutboxMessages } from "@/lib/outbox/service";

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const requestedLimit = Number(
      request.nextUrl.searchParams.get("limit") ?? "50",
    );
    const result = await listOutboxMessages({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[GET /api/admin/outbox] Unable to list outbox messages.", error);
    return NextResponse.json(
      { error: "Unable to retrieve queued notifications." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
