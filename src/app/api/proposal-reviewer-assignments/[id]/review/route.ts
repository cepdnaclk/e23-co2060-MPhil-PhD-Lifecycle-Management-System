import { DepartmentDecision, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentApplicationError,
  submitAssignedProposalReview,
} from "@/lib/applications/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum([
    DepartmentDecision.APPROVED,
    DepartmentDecision.REVISION_REQUIRED,
    DepartmentDecision.REJECTED,
  ]),
  comments: z.string().trim().min(10).max(10_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid review." },
      { status: 400 },
    );
  }

  try {
    const review = await submitAssignedProposalReview(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentApplicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to submit review." }, { status: 500 });
  }
}, [UserRole.SUPERVISOR, UserRole.EXAMINER]);
