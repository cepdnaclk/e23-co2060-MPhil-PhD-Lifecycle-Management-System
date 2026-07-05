import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  createEthicsApprovalUploadUrl,
  EthicsApprovalError,
} from "@/lib/ethics/approvals";
import { withAuth } from "@/lib/firebase/with-auth";

export const POST = withAuth(
  async (request: NextRequest, context) => {
    const body = await request.json();

    try {
      const uploadTarget = await createEthicsApprovalUploadUrl(body, context.auth);

      return NextResponse.json(uploadTarget, { status: 201 });
    } catch (error) {
      if (error instanceof EthicsApprovalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to prepare the ethics approval upload." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
