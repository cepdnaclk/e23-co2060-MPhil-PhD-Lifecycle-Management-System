import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/auth", () => ({
  authenticateBearerRequest: vi.fn(),
  AuthError: class AuthError extends Error {
    status: 401 | 403;

    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/auth/me/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the persisted identity for a HOD dashboard", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-hod-1",
      userId: "user-hod-1",
      firebaseUid: "firebase-hod-1",
      role: UserRole.HOD,
      email: "hod@example.com",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      displayName: "Professor Department",
      email: "hod@example.com",
    } as never);

    const response = await GET(
      new Request("http://localhost/api/auth/me", {
        headers: { authorization: "Bearer token" },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uid: "user-hod-1",
      role: UserRole.HOD,
      displayName: "Professor Department",
      email: "hod@example.com",
    });
    expect(authenticateBearerRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.arrayContaining([UserRole.HOD]),
    );
  });
});
