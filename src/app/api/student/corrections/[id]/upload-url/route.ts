import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  CorrectionWorkflowError,
  createOrderedCorrectionUploadUrl,
} from "@/lib/completion/corrections-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    try {
      const result = await createOrderedCorrectionUploadUrl(
        context.params?.id ?? "",
        await request.json(),
        context.auth,
      );
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof CorrectionWorkflowError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to prepare correction uploads." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
