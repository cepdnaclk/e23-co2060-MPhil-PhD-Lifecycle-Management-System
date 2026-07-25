import { describe, expect, it } from "vitest";

import {
  RequestSecurityError,
  assertCookieMutationIsTrusted,
  assertSameOriginRequest,
  createCsrfToken,
} from "@/lib/security/request";

describe("request security", () => {
  it("accepts a same-origin request with matching double-submit CSRF tokens", () => {
    const request = new Request("https://pglms.example/api/proposals", {
      method: "POST",
      headers: {
        origin: "https://pglms.example",
        "sec-fetch-site": "same-origin",
        "x-pglms-csrf": "csrf-token",
        cookie: "pglms_session=session-token; pglms_csrf=csrf-token",
      },
    });

    expect(() => assertCookieMutationIsTrusted(request)).not.toThrow();
  });

  it.each([
    {
      name: "cross-origin request",
      headers: {
        origin: "https://attacker.example",
        "x-pglms-csrf": "csrf-token",
        cookie: "pglms_csrf=csrf-token",
      },
      error: "Cross-origin request rejected.",
    },
    {
      name: "missing CSRF header",
      headers: {
        origin: "https://pglms.example",
        cookie: "pglms_csrf=csrf-token",
      },
      error: "Invalid or missing CSRF token.",
    },
    {
      name: "mismatched CSRF tokens",
      headers: {
        origin: "https://pglms.example",
        "x-pglms-csrf": "different-token",
        cookie: "pglms_csrf=csrf-token",
      },
      error: "Invalid or missing CSRF token.",
    },
  ])("rejects a $name", ({ headers, error }) => {
    const request = new Request("https://pglms.example/api/proposals", {
      method: "POST",
      headers: headers as Record<string, string>,
    });

    expect(() => assertCookieMutationIsTrusted(request)).toThrowError(
      new RequestSecurityError(error),
    );
  });

  it("requires an Origin header when creating a browser session", () => {
    const request = new Request("https://pglms.example/api/auth/session", {
      method: "POST",
    });

    expect(() => assertSameOriginRequest(request)).toThrow(
      "A valid request origin is required.",
    );
  });

  it("generates unpredictable, URL-safe CSRF tokens", () => {
    const first = createCsrfToken();
    const second = createCsrfToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});
