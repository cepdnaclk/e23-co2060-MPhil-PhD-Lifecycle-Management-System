import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  DepartmentCompletionError,
  recordProgrammeCompletion,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(async (
  _request: NextRequest,
  context,
) => {
  try {
    const completion = await recordProgrammeCompletion(
      context.params?.id ?? "",
      context.auth,
    );
    return NextResponse.json({ completion });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record completion." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR]);
