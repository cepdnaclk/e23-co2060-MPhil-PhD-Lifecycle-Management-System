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

import { GET } from "@/app/api/test/rbac/route";
import { prisma } from "@/lib/prisma/client";

describe("RBAC test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.user.findUnique).mockImplementation(async (args: never) => {
      const where = (args as { where: { firebaseUid?: string } }).where;

      if (where.firebaseUid === "firebase-admin-1") {
        return {
          id: "db-admin-1",
          firebaseUid: "firebase-admin-1",
          email: "admin@example.com",
          isActive: true,
        } as never;
      }

      if (where.firebaseUid === "firebase-student-1") {
        return {
          id: "db-student-1",
          firebaseUid: "firebase-student-1",
          email: "student@example.com",
          isActive: true,
        } as never;
      }

      return null as never;
    });

    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "ADMIN") {
          return {
            uid: "firebase-admin-1",
            email: "admin@example.com",
            role: "ADMINISTRATOR",
          };
        }

        if (token === "STUDENT") {
          return {
            uid: "firebase-student-1",
            email: "student@example.com",
            role: "STUDENT",
          };
        }

        throw new Error("Token expired");
      }),
    } as never);
  });

  it("returns the attached auth context for an administrator token", async () => {
    const response = await GET(
      new Request("http://localhost/api/test/rbac", {
        headers: {
          authorization: "Bearer ADMIN",
        },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      uid: "firebase-admin-1",
      userId: "db-admin-1",
      role: "ADMINISTRATOR",
      firebaseUid: "firebase-admin-1",
    });
  });

  it("returns 403 for a student token on an admin-only route", async () => {
    const response = await GET(
      new Request("http://localhost/api/test/rbac", {
        headers: {
          authorization: "Bearer STUDENT",
        },
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden.",
    });
  });

  it("returns 401 for an expired token", async () => {
    const response = await GET(
      new Request("http://localhost/api/test/rbac", {
        headers: {
          authorization: "Bearer EXPIRED",
        },
      }) as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid or expired token.",
    });
  });
});
