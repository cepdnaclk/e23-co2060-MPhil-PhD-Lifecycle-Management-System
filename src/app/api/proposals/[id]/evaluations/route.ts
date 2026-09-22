import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  createProposalEvaluation,
  getProposalEvaluations,
  ProposalEvaluationError,
} from "@/lib/proposals/evaluations";

type RouteParams = {
  id: string;
};

export const GET = withAuth<RouteParams>(
  async (_request: NextRequest, context) => {
    try {
      const payload = await getProposalEvaluations(
        context.params?.id ?? "",
        context.auth,
      );

      return NextResponse.json(payload);
    } catch (error) {
      if (error instanceof ProposalEvaluationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to load proposal evaluations." },
        { status: 500 },
      );
    }
  },
  [UserRole.EXAMINER, UserRole.ADMINISTRATOR, UserRole.SUPERVISOR],
);

export const POST = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    const body = await request.json();

    try {
      const payload = await createProposalEvaluation(
        context.params?.id ?? "",
        body,
        context.auth,
      );

      return NextResponse.json(payload, { status: 201 });
    } catch (error) {
      if (error instanceof ProposalEvaluationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to submit the proposal evaluation." },
        { status: 500 },
      );
    }
  },
  [UserRole.EXAMINER, UserRole.SUPERVISOR],
);
