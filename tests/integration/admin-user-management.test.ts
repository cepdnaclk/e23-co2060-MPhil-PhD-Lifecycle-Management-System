import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  createFirebaseAuthUser: vi.fn(),
  deleteFirebaseAuthUser: vi.fn(),
  setCustomClaimsForUser: vi.fn(),
  updateFirebaseAuthUser: vi.fn(),
  verifyFirebaseToken: vi.fn(),
  createSessionCookieFromIdToken: vi.fn().mockResolvedValue("session-cookie"),
  buildSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1800,
  })),
  SESSION_COOKIE_NAME: "pgsms_session",
}));

vi.mock("@/lib/email", () => ({
  notifyWelcomeAccountCreated: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/auth/session/route";
import { createAdminManagedUser } from "@/lib/admin/user-management";
import {
  createSessionCookieFromIdToken,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { notifyWelcomeAccountCreated } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

describe("administrator user management integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches a welcome email when a supervisor account is created", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user-4",
            email: "supervisor@example.com",
            displayName: "Dr. Supervisor",
            role: UserRole.SUPERVISOR,
            isActive: true,
            firebaseUid: "firebase-supervisor-4",
          }),
        },
        supervisor: {
          create: vi.fn().mockResolvedValue({
            id: "supervisor-4",
          }),
        },
        examiner: {
          create: vi.fn(),
        },
        administrator: {
          create: vi.fn(),
        },
      };

      return callback(tx as never);
    });

    const { createFirebaseAuthUser, setCustomClaimsForUser } = await import(
      "@/lib/firebase/admin"
    );
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-supervisor-4",
    } as never);

    await createAdminManagedUser({
      email: "supervisor@example.com",
      displayName: "Dr. Supervisor",
      role: UserRole.SUPERVISOR,
      department: "Computer Engineering",
    });

    expect(setCustomClaimsForUser).toHaveBeenCalledWith(
      "firebase-supervisor-4",
      UserRole.SUPERVISOR,
    );
    expect(notifyWelcomeAccountCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "supervisor@example.com",
        roleLabel: UserRole.SUPERVISOR,
      }),
    );
  });

  it("prevents a deactivated user from obtaining a new session", async () => {
    vi.mocked(verifyFirebaseToken).mockResolvedValue({
      uid: "firebase-disabled-user",
      role: UserRole.SUPERVISOR,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-disabled",
      isActive: false,
      role: UserRole.SUPERVISOR,
      firebaseUid: "firebase-disabled-user",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken: "disabled-user-token",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Your account is inactive. Please contact an administrator.",
    });
    expect(createSessionCookieFromIdToken).not.toHaveBeenCalled();
  });
});
