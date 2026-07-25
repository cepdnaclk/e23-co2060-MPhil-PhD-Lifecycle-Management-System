import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pglms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { getAuth } from "firebase-admin/auth";

import { DELETE, PATCH, POST } from "@/app/api/auth/session/route";
import { prisma } from "@/lib/prisma/client";

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-student-1",
        role: "STUDENT",
      }),
      createSessionCookie: vi.fn().mockResolvedValue("session-cookie-value"),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("sets a secure session cookie and returns success for an active user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      isActive: true,
      role: "STUDENT",
      firebaseUid: "firebase-student-1",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          idToken: "valid-id-token",
        }),
      }),
    );

    const setCookieHeader = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookieHeader).toContain("pglms_session=session-cookie-value");
    expect(setCookieHeader).toContain("pglms_csrf=");
    expect(setCookieHeader.toLowerCase()).toContain("httponly");
    expect(setCookieHeader.toLowerCase()).toContain("secure");
    expect(setCookieHeader.toLowerCase()).toContain("samesite=lax");
  });

  it("returns a custom inactive-user error and does not set a session cookie", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-2",
      isActive: false,
      role: "STUDENT",
      firebaseUid: "firebase-student-1",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          idToken: "valid-id-token",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Your account is inactive. Please contact an administrator.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refreshes the session activity window when the cookie is still active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      isActive: true,
      role: "STUDENT",
      firebaseUid: "firebase-student-1",
    } as never);

    vi.mocked(getAuth).mockReturnValue({
      verifySessionCookie: vi.fn().mockResolvedValue({
        uid: "firebase-student-1",
        role: "STUDENT",
      }),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    } as never);

    const now = new Date("2026-05-01T10:00:00.000Z").getTime();
    const response = await PATCH(
      new Request("http://localhost/api/auth/session", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "x-pglms-csrf": "csrf-token",
          cookie: `pglms_session=session-cookie-value; pglms_session_activity=${now}; pglms_csrf=csrf-token`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "pglms_session_activity=",
    );

    vi.useRealTimers();
  });

  it("expires the session when the inactivity window is older than 30 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));

    const staleActivityAt = new Date("2026-05-01T09:29:59.000Z").getTime();
    const response = await PATCH(
      new Request("http://localhost/api/auth/session", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          "x-pglms-csrf": "csrf-token",
          cookie: `pglms_session=session-cookie-value; pglms_session_activity=${staleActivityAt}; pglms_csrf=csrf-token`,
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Session expired due to inactivity.",
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    vi.useRealTimers();
  });

  it("rejects session creation when the Firebase claim differs from the local role", async () => {
    const revokeRefreshTokens = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-student-1",
        role: "ADMINISTRATOR",
      }),
      createSessionCookie: vi.fn(),
      revokeRefreshTokens,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      isActive: true,
      role: "STUDENT",
      firebaseUid: "firebase-student-1",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ idToken: "valid-id-token" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(revokeRefreshTokens).toHaveBeenCalledWith("firebase-student-1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects session refresh and logout requests without a CSRF token", async () => {
    const headers = {
      origin: "http://localhost",
      cookie: `pglms_session=session-cookie-value; pglms_session_activity=${Date.now()}`,
    };

    const patchResponse = await PATCH(
      new Request("http://localhost/api/auth/session", {
        method: "PATCH",
        headers,
      }),
    );
    const deleteResponse = await DELETE(
      new Request("http://localhost/api/auth/session", {
        method: "DELETE",
        headers,
      }),
    );

    expect(patchResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
  });

  it("clears session and CSRF cookies on trusted logout", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/auth/session", {
        method: "DELETE",
        headers: {
          origin: "http://localhost",
          "x-pglms-csrf": "csrf-token",
          cookie: "pglms_csrf=csrf-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("pglms_session=");
    expect(response.headers.get("set-cookie")).toContain("pglms_csrf=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
