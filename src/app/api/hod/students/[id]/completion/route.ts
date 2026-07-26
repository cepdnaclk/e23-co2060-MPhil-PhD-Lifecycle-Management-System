import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  approveProgrammeCompletion,
  DepartmentCompletionError,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  comments: z.string().trim().min(10).max(5_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid completion decision." }, { status: 400 });
  }
  try {
    const completion = await approveProgrammeCompletion(
      context.params?.id ?? "",
      parsed.data.comments,
      context.auth,
    );
    return NextResponse.json({ completion });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to approve completion." }, { status: 500 });
  }
}, [UserRole.HOD]);
