import { ExaminerRecommendation, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentExaminationError,
  recordHodVivaOutcome,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  outcome: z.nativeEnum(ExaminerRecommendation),
  reason: z.string().trim().min(10).max(5_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid HOD outcome." }, { status: 400 });
  }
  try {
    const viva = await recordHodVivaOutcome(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ viva });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record viva outcome." }, { status: 500 });
  }
}, [UserRole.HOD]);
