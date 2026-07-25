import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  createCorrectionUploadUrl,
  ThesisCorrectionError,
} from "@/lib/theses/corrections";

type RouteParams = { id: string };

export const POST = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    try {
      const uploadTarget = await createCorrectionUploadUrl(
        context.params?.id ?? "",
        await request.json(),
        context.auth,
      );
      return NextResponse.json(uploadTarget, { status: 201 });
    } catch (error) {
      if (error instanceof ThesisCorrectionError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to prepare the correction upload." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
