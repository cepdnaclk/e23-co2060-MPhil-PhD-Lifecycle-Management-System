import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  EthicsApprovalError,
  updateEthicsApprovalDecision,
} from "@/lib/ethics/approvals";
import { withAuth } from "@/lib/firebase/with-auth";

type RouteParams = {
  id: string;
};

export const PATCH = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    const body = await request.json();

    try {
      const approval = await updateEthicsApprovalDecision(
        context.params?.id ?? "",
        body,
        context.auth,
      );

      return NextResponse.json({ approval });
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to update ethics approval decision." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
