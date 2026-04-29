import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pgsms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(),
}));

import {
  buildSessionCookieOptions,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

describe("verifyFirebaseToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts the intended role from a verified JWT", async () => {
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-123",
        email: "student@example.com",
        role: "STUDENT",
      }),
    } as never);

    const decodedToken = await verifyFirebaseToken("mock.jwt.token");

    expect(decodedToken.uid).toBe("firebase-123");
    expect(decodedToken.role).toBe("STUDENT");
  });
});

describe("buildSessionCookieOptions", () => {
  it("returns httpOnly, secure, sameSite=lax cookie settings", () => {
    expect(buildSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
