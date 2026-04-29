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

import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";

import type { WithAuthContext } from "@/lib/firebase/with-auth";
import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

describe("withAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the wrapped handler when the verified role matches", async () => {
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-admin-1",
        email: "admin@example.com",
        role: "ADMINISTRATOR",
      }),
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "db-admin-1",
      firebaseUid: "firebase-admin-1",
      email: "admin@example.com",
      isActive: true,
    } as never);

    const handler = vi.fn(
      async (
        _request: Request,
        context: WithAuthContext,
      ) =>
      NextResponse.json({
        uid: context.auth.uid,
        role: context.auth.role,
      }),
    );

    const guardedHandler = withAuth(handler, ["ADMINISTRATOR"]);
    const response = await guardedHandler(
      new Request("http://localhost/api/test", {
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      uid: "firebase-admin-1",
      role: "ADMINISTRATOR",
    });
  });

  it("returns 403 when the verified role is not allowed", async () => {
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-student-1",
        email: "student@example.com",
        role: "STUDENT",
      }),
    } as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "db-student-1",
      firebaseUid: "firebase-student-1",
      email: "student@example.com",
      isActive: true,
    } as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const guardedHandler = withAuth(handler, ["ADMINISTRATOR"]);
    const response = await guardedHandler(
      new Request("http://localhost/api/test", {
        headers: {
          authorization: "Bearer student-token",
        },
      }) as never,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden.",
    });
  });

  it("returns 401 for missing or invalid tokens", async () => {
    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Token expired")),
    } as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const guardedHandler = withAuth(handler, ["ADMINISTRATOR"]);

    const missingTokenResponse = await guardedHandler(
      new Request("http://localhost/api/test") as never,
    );

    const invalidTokenResponse = await guardedHandler(
      new Request("http://localhost/api/test", {
        headers: {
          authorization: "Bearer expired-token",
        },
      }) as never,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(missingTokenResponse.status).toBe(401);
    expect(invalidTokenResponse.status).toBe(401);
  });
});
