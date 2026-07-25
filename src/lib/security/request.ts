import { randomBytes, timingSafeEqual } from "node:crypto";

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  isStateChangingMethod,
} from "@/lib/security/request-shared";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, isStateChangingMethod };

export class RequestSecurityError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 415 = 403,
  ) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

function getCookieValue(cookieHeader: string, cookieName: string) {
  for (const segment of cookieHeader.split(";")) {
    const [name, ...valueParts] = segment.trim().split("=");

    if (name === cookieName) {
      return valueParts.join("=");
    }
  }

  return null;
}

function valuesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getExpectedOrigin(request: Request) {
  return new URL(request.url).origin;
}

export function createCsrfToken() {
  return randomBytes(32).toString("base64url");
}

export function assertSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin || origin === "null") {
    throw new RequestSecurityError("A valid request origin is required.");
  }

  let normalizedOrigin: string;

  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new RequestSecurityError("The request origin is invalid.");
  }

  if (normalizedOrigin !== getExpectedOrigin(request)) {
    throw new RequestSecurityError("Cross-origin request rejected.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new RequestSecurityError("Cross-site request rejected.");
  }
}

export function assertCookieMutationIsTrusted(request: Request) {
  if (!isStateChangingMethod(request.method)) {
    return;
  }

  assertSameOriginRequest(request);

  const cookieToken = getCookieValue(
    request.headers.get("cookie") ?? "",
    CSRF_COOKIE_NAME,
  );
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (
    !cookieToken ||
    !headerToken ||
    !valuesMatch(cookieToken, headerToken)
  ) {
    throw new RequestSecurityError("Invalid or missing CSRF token.");
  }
}

export function assertJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.startsWith("application/json")) {
    throw new RequestSecurityError(
      "State-changing API requests must use application/json.",
      415,
    );
  }
}

export function buildCsrfCookieOptions(overrides?: { maxAge?: number }) {
  return {
    httpOnly: false as const,
    secure: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: overrides?.maxAge,
  };
}
