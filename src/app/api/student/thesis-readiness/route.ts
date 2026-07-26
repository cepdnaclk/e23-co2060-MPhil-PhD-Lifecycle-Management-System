import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentExaminationError,
  requestThesisReadiness,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  studentMessage: z.string().trim().max(2_000).optional(),
});

export const POST = withAuth(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid readiness request." }, { status: 400 });
  }
  try {
    const readiness = await requestThesisReadiness(parsed.data, context.auth);
    return NextResponse.json({ readiness }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to request thesis readiness." },
      { status: 500 },
    );
  }
}, [UserRole.STUDENT]);
