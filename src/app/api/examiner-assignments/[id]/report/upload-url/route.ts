import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  createExaminerReportUploadUrl,
  DepartmentExaminationError,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    try {
      const upload = await createExaminerReportUploadUrl(
        context.params?.id ?? "",
        await request.json(),
        context.auth,
      );
      return NextResponse.json(upload, { status: 201 });
    } catch (error) {
      if (error instanceof DepartmentExaminationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        { error: "Unable to prepare the examiner report upload." },
        { status: 500 },
      );
    }
  },
  [UserRole.EXAMINER],
);
