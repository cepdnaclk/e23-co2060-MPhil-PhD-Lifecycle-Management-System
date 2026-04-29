import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  createSessionCookieFromIdToken,
} from "@/lib/firebase/admin";

type CreateSessionRequestBody = {
  idToken?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateSessionRequestBody;

  if (!body.idToken) {
    return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  }

  const sessionCookie = await createSessionCookieFromIdToken(body.idToken);
  const response = NextResponse.json({ ok: true });

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
