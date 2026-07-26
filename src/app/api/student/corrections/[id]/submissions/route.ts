import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  CorrectionWorkflowError,
  submitOrderedCorrections,
} from "@/lib/completion/corrections-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    try {
      const submission = await submitOrderedCorrections(
        context.params?.id ?? "",
        await request.json(),
        context.auth,
      );
      return NextResponse.json({ submission }, { status: 201 });
    } catch (error) {
      if (error instanceof CorrectionWorkflowError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to submit ordered corrections." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
