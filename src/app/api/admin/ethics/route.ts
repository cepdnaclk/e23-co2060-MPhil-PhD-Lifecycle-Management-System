import { EthicsApprovalStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  EthicsApprovalError,
  listEthicsApprovals,
} from "@/lib/ethics/approvals";
import { withAuth } from "@/lib/firebase/with-auth";

function parseStatus(value: string | null) {
  if (!value) {
    return undefined;
  }

  if (!Object.values(EthicsApprovalStatus).includes(value as EthicsApprovalStatus)) {
    throw new EthicsApprovalError("Unsupported ethics approval status filter.", 400);
  }

  return value as EthicsApprovalStatus;
}

export const GET = withAuth(
  async (request: NextRequest) => {
    try {
      const approvals = await listEthicsApprovals({
        status: parseStatus(request.nextUrl.searchParams.get("status")),
      });

      return NextResponse.json({ approvals });
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to load ethics approval records." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
