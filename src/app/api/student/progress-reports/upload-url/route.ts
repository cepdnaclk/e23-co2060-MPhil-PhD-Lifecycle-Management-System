import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  createProgressReportUploadUrl,
  ProgressReportUploadError,
} from "@/lib/progress-reports/upload";

export const POST = withAuth(
  async (request: NextRequest, context) => {
    try {
      const uploadTarget = await createProgressReportUploadUrl(
        await request.json(),
        context.auth,
      );
      return NextResponse.json(uploadTarget, { status: 201 });
    } catch (error) {
      if (error instanceof ProgressReportUploadError) {
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
