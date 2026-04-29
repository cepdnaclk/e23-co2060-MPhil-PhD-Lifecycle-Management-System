import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  createSessionCookieFromIdToken,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma/client";

type CreateSessionRequestBody = {
  idToken?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateSessionRequestBody;

  if (!body.idToken) {
    return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  }

  let decodedToken;

  try {
    decodedToken = await verifyFirebaseToken(body.idToken);
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired Firebase token." },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { firebaseUid: decodedToken.uid },
    select: {
      id: true,
      isActive: true,
      role: true,
      firebaseUid: true,
    },
  });

  if (!user?.firebaseUid) {
    return NextResponse.json(
      { error: "User record is not linked to Firebase." },
      { status: 401 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: "Your account is inactive. Please contact an administrator." },
      { status: 403 },
    );
  }

  const sessionCookie = await createSessionCookieFromIdToken(body.idToken);
  const response = NextResponse.json({ ok: true, role: user.role });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionCookie,
    buildSessionCookieOptions(),
  );

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    buildSessionCookieOptions({ maxAge: 0 }),
  );

  return response;
}
