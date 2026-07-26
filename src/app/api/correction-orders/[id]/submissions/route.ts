import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentCompletionError,
  submitOrderedCorrections,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  responseSummary: z.string().trim().min(20).max(10_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid correction submission." }, { status: 400 });
  }
  try {
    const submission = await submitOrderedCorrections(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to submit corrections." }, { status: 500 });
  }
}, [UserRole.STUDENT]);
