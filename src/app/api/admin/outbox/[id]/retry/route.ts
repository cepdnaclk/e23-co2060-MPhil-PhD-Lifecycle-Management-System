import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { retryOutboxMessage } from "@/lib/outbox/service";

type RouteParams = {
  id: string;
};

export const POST = withAuth<RouteParams>(async (
  _request: NextRequest,
  context,
) => {
  try {
    const retried = await retryOutboxMessage(context.params?.id ?? "");

    if (!retried) {
      return NextResponse.json(
        { error: "Only failed or dead-letter notifications can be retried." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/admin/outbox/:id/retry] Retry failed.", error);
    return NextResponse.json(
      { error: "Unable to retry the queued notification." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
