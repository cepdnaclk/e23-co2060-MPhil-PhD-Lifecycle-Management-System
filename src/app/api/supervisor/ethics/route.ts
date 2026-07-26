import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  EthicsApprovalError,
  listEthicsApprovals,
} from "@/lib/ethics/approvals";
import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    try {
      return NextResponse.json({
        approvals: await listEthicsApprovals(context.auth),
      });
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to load the Supervisor ethics queue." },
        { status: 500 },
      );
    }
  },
  [UserRole.SUPERVISOR],
);
