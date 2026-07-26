import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  CorrectionWorkflowError,
  reviewCorrectionsByExaminer,
} from "@/lib/completion/corrections-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum(["APPROVE", "RETURN"]),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid Examiner correction review." },
        { status: 400 },
      );
    }
    try {
      const order = await reviewCorrectionsByExaminer(
        context.params?.id ?? "",
        parsed.data,
        context.auth,
      );
      return NextResponse.json({ order });
    } catch (error) {
      if (error instanceof CorrectionWorkflowError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to record the Examiner correction review." },
        { status: 500 },
      );
    }
  },
  [UserRole.EXAMINER],
);
