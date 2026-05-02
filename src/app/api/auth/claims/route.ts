import { NextResponse } from "next/server";

import { syncFirebaseClaimsRequestSchema } from "@/lib/auth/schemas";
import { syncFirebaseClaimsToUser } from "@/lib/firebase/claims";

export async function POST(request: Request) {
  const parsed = syncFirebaseClaimsRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Invalid payload for Firebase custom claims assignment.",
      },
      { status: 400 },
    );
  }

  const user = await syncFirebaseClaimsToUser({
    userId: parsed.data.userId,
    firebaseUid: parsed.data.firebaseUid,
    role: parsed.data.role,
  });

  return NextResponse.json({
    userId: user.id,
    firebaseUid: user.firebaseUid,
    role: user.role,
  });
}
