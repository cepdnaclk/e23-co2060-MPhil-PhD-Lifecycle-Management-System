import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  ApplicationSubmissionError,
  executeApprovedAdmission,
} from "@/lib/applications/submission";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(async (
  _request: NextRequest,
  context,
) => {
  try {
    const application = await executeApprovedAdmission(
      context.params?.id ?? "",
      context.auth,
    );
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to execute admission." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
