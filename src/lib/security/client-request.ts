"use client";

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  isStateChangingMethod,
} from "@/lib/security/request-shared";

function readCookie(cookieName: string) {
  if (typeof document === "undefined") {
    return null;
  }

  for (const segment of document.cookie.split(";")) {
    const [name, ...valueParts] = segment.trim().split("=");

    if (name === cookieName) {
      return valueParts.join("=");
    }
  }

  return null;
}

function isSameOriginInput(input: RequestInfo | URL) {
  if (typeof window === "undefined") {
    return false;
  }

  const rawUrl =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input;

  return new URL(rawUrl, window.location.origin).origin === window.location.origin;
}

export function secureFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const method =
    init.method ?? (input instanceof Request ? input.method : "GET");

  if (!isStateChangingMethod(method) || !isSameOriginInput(input)) {
    return fetch(input, init);
  }

  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );

  if (csrfToken) {
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
