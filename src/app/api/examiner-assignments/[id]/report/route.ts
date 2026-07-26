import { ExaminerRecommendation, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentExaminationError,
  submitThesisExaminerReport,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  recommendation: z.nativeEnum(ExaminerRecommendation),
  reportText: z.string().trim().min(20).max(30_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid examiner report." }, { status: 400 });
  }
  try {
    const report = await submitThesisExaminerReport(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to submit examiner report." }, { status: 500 });
  }
}, [UserRole.EXAMINER]);
