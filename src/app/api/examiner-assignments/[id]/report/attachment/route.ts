import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  attachExaminerReportPdf,
  DepartmentExaminationError,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ uploadSessionId: z.string().uuid() });

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report PDF upload." }, { status: 400 });
    }
    try {
      const document = await attachExaminerReportPdf(
        context.params?.id ?? "",
        parsed.data.uploadSessionId,
        context.auth,
      );
      return NextResponse.json({ document }, { status: 201 });
    } catch (error) {
      if (error instanceof DepartmentExaminationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        { error: "Unable to attach the examiner report PDF." },
        { status: 500 },
      );
    }
  },
  [UserRole.EXAMINER],
);
