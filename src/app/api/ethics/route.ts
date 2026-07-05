import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  EthicsApprovalError,
  getStudentEthicsApprovalOverview,
  submitEthicsApproval,
} from "@/lib/ethics/approvals";
import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    try {
      const overview = await getStudentEthicsApprovalOverview(context.auth);

      return NextResponse.json(overview);
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to load the ethics approval workspace." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);

export const POST = withAuth(
  async (request: NextRequest, context) => {
    const body = await request.json();

    try {
      const approval = await submitEthicsApproval(body, context.auth);

      return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to submit the ethics approval application." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
