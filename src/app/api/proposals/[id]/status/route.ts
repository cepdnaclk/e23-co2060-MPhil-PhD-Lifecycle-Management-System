import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  ProposalSubmissionError,
  updateResearchProposalStatus,
} from "@/lib/proposals/submission";

type RouteParams = {
  id: string;
};

export const PATCH = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    const body = await request.json();

    try {
      const proposal = await updateResearchProposalStatus(
        context.params?.id ?? "",
        body,
        context.auth,
      );

      return NextResponse.json({ proposal });
    } catch (error) {
      if (error instanceof ProposalSubmissionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to update proposal status." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR, UserRole.SUPERVISOR],
);
