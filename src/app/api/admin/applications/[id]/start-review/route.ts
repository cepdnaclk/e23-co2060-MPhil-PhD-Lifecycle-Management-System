import { ApplicationStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  ApplicationSubmissionError,
  updateApplicationStatus,
} from "@/lib/applications/submission";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(
  async (_request: NextRequest, context) => {
    try {
      const application = await updateApplicationStatus(
        context.params?.id ?? "",
        ApplicationStatus.UNDER_REVIEW,
      );
      return NextResponse.json({
        application: { id: application.id, status: application.status },
      });
    } catch (error) {
      if (error instanceof ApplicationSubmissionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        { error: "Unable to begin application review." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
