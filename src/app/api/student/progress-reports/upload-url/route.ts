import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  createProgressReportUploadUrl,
  ProgressReportSubmissionError,
} from "@/lib/progress-reports/submission";

export const POST = withAuth(
  async (request: NextRequest, context) => {
    try {
      const uploadTarget = await createProgressReportUploadUrl(
        await request.json(),
        context.auth,
      );
      return NextResponse.json(uploadTarget, { status: 201 });
    } catch (error) {
      if (error instanceof ProgressReportSubmissionError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to prepare the progress report upload." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
