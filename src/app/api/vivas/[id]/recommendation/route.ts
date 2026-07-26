import { ExaminerRecommendation, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentExaminationError,
  submitVivaRecommendation,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  recommendation: z.nativeEnum(ExaminerRecommendation),
  rationale: z.string().trim().min(20).max(10_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid viva recommendation." }, { status: 400 });
  }
  try {
    const recommendation = await submitVivaRecommendation(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ recommendation }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to submit recommendation." }, { status: 500 });
  }
}, [UserRole.EXAMINER]);
