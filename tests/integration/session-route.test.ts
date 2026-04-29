import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pgsms-firebase-admin" }]),
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

import { POST } from "@/app/api/auth/session/route";
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
        },
        body: JSON.stringify({
          idToken: "valid-id-token",
        }),
      }),
    );

    const setCookieHeader = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookieHeader).toContain("pgsms_session=session-cookie-value");
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
});
