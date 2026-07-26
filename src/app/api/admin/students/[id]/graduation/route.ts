import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentCompletionError,
  recordGraduation,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ graduationDate: z.coerce.date() });

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid graduation date." }, { status: 400 });
  }
  try {
    const graduation = await recordGraduation(
      context.params?.id ?? "",
      parsed.data.graduationDate,
      context.auth,
    );
    return NextResponse.json({ graduation });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record graduation." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR]);
