import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  approveCorrectionCompletion,
  DepartmentCompletionError,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ notes: z.string().trim().max(5_000).optional() });

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid completion approval." }, { status: 400 });
  }
  try {
    const order = await approveCorrectionCompletion(
      context.params?.id ?? "",
      parsed.data.notes,
      context.auth,
    );
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to approve corrections." }, { status: 500 });
  }
}, [UserRole.HOD]);
