import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionRequestSchema } from "@/lib/auth/schemas";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  createSessionCookieFromIdToken,
  verifyFirebaseSessionCookie,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { createServerErrorResponse } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import {
  SESSION_ACTIVITY_COOKIE_NAME,
  SESSION_INACTIVITY_TIMEOUT_SECONDS,
  buildSessionActivityValue,
  hasSessionExpiredByInactivity,
} from "@/lib/security/session";

function setSessionCookies(response: NextResponse, sessionCookie: string) {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionCookie,
    buildSessionCookieOptions(),
  );
  response.cookies.set(SESSION_ACTIVITY_COOKIE_NAME, buildSessionActivityValue(), {
    ...buildSessionCookieOptions({
      maxAge: SESSION_INACTIVITY_TIMEOUT_SECONDS,
    }),
    httpOnly: true,
  });
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    buildSessionCookieOptions({ maxAge: 0 }),
  );
  response.cookies.set(
    SESSION_ACTIVITY_COOKIE_NAME,
    "",
    buildSessionCookieOptions({ maxAge: 0 }),
  );
}

export async function POST(request: Request) {
  let body: z.infer<typeof createSessionRequestSchema>;

  try {
    body = createSessionRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid session request." },
        { status: 400 },
      );
    }

    return createServerErrorResponse({
      error,
      message: "Unable to create a secure session.",
      route: "/api/auth/session",
      method: "POST",
    });
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

  try {
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

    setSessionCookies(response, sessionCookie);

    return response;
  } catch (error) {
    return createServerErrorResponse({
      error,
      message: "Unable to create a secure session.",
      route: "/api/auth/session",
      method: "POST",
      metadata: {
        hasIdToken: true,
        firebaseUid: decodedToken.uid,
      },
    });
  }
}

export async function PATCH(request: Request) {
  const sessionCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(`${SESSION_COOKIE_NAME}=`.length);
  const activityCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(`${SESSION_ACTIVITY_COOKIE_NAME}=`))
    ?.slice(`${SESSION_ACTIVITY_COOKIE_NAME}=`.length);

  if (!sessionCookie || hasSessionExpiredByInactivity(activityCookie)) {
    const response = NextResponse.json(
      { error: "Session expired due to inactivity." },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }

  try {
    await verifyFirebaseSessionCookie(sessionCookie);

    const response = NextResponse.json({
      ok: true,
      expiresInSeconds: SESSION_COOKIE_MAX_AGE_SECONDS,
      inactivityWindowSeconds: SESSION_INACTIVITY_TIMEOUT_SECONDS,
    });
    setSessionCookies(response, sessionCookie);
    return response;
  } catch {
    const response = NextResponse.json(
      { error: "Invalid or expired session." },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  clearSessionCookies(response);

  return response;
}
