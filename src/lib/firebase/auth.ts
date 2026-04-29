import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma/client";
import {
  SESSION_COOKIE_NAME,
  type VerifiedFirebaseToken,
  verifyFirebaseSessionCookie,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { assertRoleAuthorized } from "@/lib/firebase/authorization";
import { type AppUserRole, type AuthenticatedUserContext } from "@/types/auth";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function getCookieValue(cookieHeader: string, cookieName: string): string | null {
  const cookies = cookieHeader.split(";").map((segment) => segment.trim());

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");

    if (name === cookieName) {
      return valueParts.join("=");
    }
  }

  return null;
}

export function extractBearerToken(
  headers: Headers | Pick<Headers, "get">,
): string | null {
  const authorizationHeader = headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

async function resolveAuthenticatedUser(
  decodedToken: VerifiedFirebaseToken | null,
): Promise<AuthenticatedUserContext | null> {
  if (!decodedToken?.uid || !decodedToken.role) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { firebaseUid: decodedToken.uid },
    select: {
      id: true,
      firebaseUid: true,
      email: true,
      isActive: true,
    },
  });

  if (!user?.isActive || !user.firebaseUid) {
    return null;
  }

  return {
    uid: decodedToken.uid,
    userId: user.id,
    firebaseUid: user.firebaseUid,
    role: decodedToken.role,
    email: user.email,
  };
}

export async function getCurrentUser(
  request: Pick<NextRequest, "headers"> | Pick<Request, "headers">,
): Promise<AuthenticatedUserContext | null> {
  const bearerToken = extractBearerToken(request.headers);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);

  const decodedToken = bearerToken
    ? await verifyFirebaseToken(bearerToken)
    : sessionCookie
      ? await verifyFirebaseSessionCookie(sessionCookie)
      : null;

  return resolveAuthenticatedUser(decodedToken);
}

export async function authenticateBearerRequest(
  request: Pick<NextRequest, "headers"> | Pick<Request, "headers">,
  allowedRoles: AppUserRole[],
): Promise<AuthenticatedUserContext> {
  const bearerToken = extractBearerToken(request.headers);

  if (!bearerToken) {
    throw new AuthError("Missing bearer token.", 401);
  }

  let decodedToken: VerifiedFirebaseToken;

  try {
    decodedToken = await verifyFirebaseToken(bearerToken);
  } catch {
    throw new AuthError("Invalid or expired token.", 401);
  }

  const currentUser = await resolveAuthenticatedUser(decodedToken);

  if (!currentUser) {
    throw new AuthError("Unauthenticated.", 401);
  }

  try {
    assertRoleAuthorized(currentUser.role, allowedRoles);
  } catch {
    throw new AuthError("Forbidden.", 403);
  }

  return currentUser;
}

export async function requireAuthenticatedRole(
  request: Pick<NextRequest, "headers"> | Pick<Request, "headers">,
  allowedRoles: AppUserRole[],
): Promise<AuthenticatedUserContext> {
  return authenticateBearerRequest(request, allowedRoles);
}
