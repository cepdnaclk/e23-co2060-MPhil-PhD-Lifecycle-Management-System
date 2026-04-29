import { NextResponse } from "next/server";

import { syncFirebaseClaimsToUser } from "@/lib/firebase/claims";
import { isAppUserRole } from "@/types/auth";

type SetClaimsRequestBody = {
  userId?: string;
  firebaseUid?: string;
  role?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SetClaimsRequestBody;

  if (!body.userId || !body.firebaseUid || !isAppUserRole(body.role)) {
    return NextResponse.json(
      { error: "Invalid payload for Firebase custom claims assignment." },
      { status: 400 },
    );
  }

  const user = await syncFirebaseClaimsToUser({
    userId: body.userId,
    firebaseUid: body.firebaseUid,
    role: body.role,
  });

  return NextResponse.json({
    userId: user.id,
    firebaseUid: user.firebaseUid,
    role: user.role,
  });
}
