import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  archiveStudentRecord,
  DepartmentCompletionError,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ reason: z.string().trim().min(10).max(5_000) });

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Archive reason is required." }, { status: 400 });
  }
  try {
    const archive = await archiveStudentRecord(
      context.params?.id ?? "",
      parsed.data.reason,
      context.auth,
    );
    return NextResponse.json({ archive });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to archive record." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR]);
