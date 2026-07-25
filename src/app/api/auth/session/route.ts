import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionRequestSchema } from "@/lib/auth/schemas";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  createSessionCookieFromIdToken,
  revokeFirebaseRefreshTokens,
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
import {
  CSRF_COOKIE_NAME,
  RequestSecurityError,
  assertCookieMutationIsTrusted,
  assertSameOriginRequest,
  buildCsrfCookieOptions,
  createCsrfToken,
} from "@/lib/security/request";
import type { VerifiedFirebaseToken } from "@/lib/firebase/admin";

async function findAuthoritativeUser(decodedToken: VerifiedFirebaseToken) {
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
    return {
      error: NextResponse.json(
        { error: "User record is not linked to Firebase." },
        { status: 401 },
      ),
    };
  }

  if (!user.isActive) {
    return {
      error: NextResponse.json(
        { error: "Your account is inactive. Please contact an administrator." },
        { status: 403 },
      ),
    };
  }

  if (decodedToken.role !== user.role) {
    console.warn("Session creation rejected due to a role mismatch.", {
      userId: user.id,
    });
    await revokeFirebaseRefreshTokens(decodedToken.uid);

    return {
      error: NextResponse.json(
        { error: "Your account role is out of date. Please contact an administrator." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

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
  response.cookies.set(
    CSRF_COOKIE_NAME,
    createCsrfToken(),
    buildCsrfCookieOptions({
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    }),
  );
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
  response.cookies.set(
    CSRF_COOKIE_NAME,
    "",
    buildCsrfCookieOptions({ maxAge: 0 }),
  );
}

function requestSecurityErrorResponse(error: unknown) {
  if (error instanceof RequestSecurityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
  } catch (error) {
    return (
      requestSecurityErrorResponse(error) ??
      NextResponse.json({ error: "Request security validation failed." }, { status: 403 })
    );
  }

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
    const authoritativeUser = await findAuthoritativeUser(decodedToken);

    if ("error" in authoritativeUser && authoritativeUser.error) {
      return authoritativeUser.error;
    }

    const sessionCookie = await createSessionCookieFromIdToken(body.idToken);
    const response = NextResponse.json({
      ok: true,
      role: authoritativeUser.user.role,
    });

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
  try {
    assertCookieMutationIsTrusted(request);
  } catch (error) {
    return (
      requestSecurityErrorResponse(error) ??
      NextResponse.json({ error: "Request security validation failed." }, { status: 403 })
    );
  }

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
    const decodedToken = await verifyFirebaseSessionCookie(sessionCookie);
    const authoritativeUser = await findAuthoritativeUser(decodedToken);

    if ("error" in authoritativeUser && authoritativeUser.error) {
      const response = authoritativeUser.error;
      clearSessionCookies(response);
      return response;
    }

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

export async function DELETE(request: Request) {
  try {
    assertCookieMutationIsTrusted(request);
  } catch (error) {
    return (
      requestSecurityErrorResponse(error) ??
      NextResponse.json({ error: "Request security validation failed." }, { status: 403 })
    );
  }

  const response = NextResponse.json({ ok: true });

  clearSessionCookies(response);

  return response;
}
