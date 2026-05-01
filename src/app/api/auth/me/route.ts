import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    return NextResponse.json({
      uid: context.auth.userId,
      role: context.auth.role,
    });
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
  ],
);
