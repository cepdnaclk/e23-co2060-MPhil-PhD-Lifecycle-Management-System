import { NextResponse } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(
  async (_request, context) => {
    return NextResponse.json({
      uid: context.auth.uid,
      userId: context.auth.userId,
      role: context.auth.role,
      firebaseUid: context.auth.firebaseUid,
    });
  },
  ["ADMINISTRATOR"],
);
