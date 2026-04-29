import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authenticateBearerRequest } from "@/lib/firebase/auth";
import {
  DashboardAccessError,
  getDashboardSummaryForUser,
} from "@/lib/dashboard/summary";
import { isDashboardRole } from "@/types/dashboard";

type RouteParams = {
  role: string;
};

export async function GET(
  request: NextRequest,
  context: { params: RouteParams },
) {
  const requestedRole = context.params.role;

  if (!isDashboardRole(requestedRole)) {
    return NextResponse.json({ error: "Unknown dashboard role." }, { status: 404 });
  }

  try {
    const auth = await authenticateBearerRequest(request, [
      "STUDENT",
      "SUPERVISOR",
      "EXAMINER",
      "ADMINISTRATOR",
    ]);
    const summary = await getDashboardSummaryForUser(auth, requestedRole);

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof DashboardAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to load dashboard summary." },
      { status: 500 },
    );
  }
}
