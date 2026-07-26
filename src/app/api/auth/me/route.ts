import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    const user = await prisma.user.findUnique({
      where: { id: context.auth.userId },
      select: { displayName: true, email: true },
    });

    return NextResponse.json({
      uid: context.auth.userId,
      role: context.auth.role,
      displayName: user?.displayName ?? null,
      email: user?.email ?? null,
    });
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
    UserRole.HOD,
  ],
);
