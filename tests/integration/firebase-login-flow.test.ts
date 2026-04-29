import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/app", () => ({
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn(() => ({ name: "mock-firebase-app" })),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

import { signInWithEmailAndPassword } from "firebase/auth";

import { assertRoleAuthorized } from "@/lib/firebase/authorization";
import { signInAndGetRoleClaim } from "@/lib/firebase/client";

describe("Firebase login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "STUDENT",
    "SUPERVISOR",
    "EXAMINER",
    "ADMINISTRATOR",
  ] as const)(
    "returns the expected custom claim for %s",
    async (role) => {
      vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
        user: {
          getIdTokenResult: vi.fn().mockResolvedValue({
            claims: { role },
          }),
        },
      } as never);

      const resolvedRole = await signInAndGetRoleClaim(
        `${role.toLowerCase()}@example.com`,
        "password123",
      );

      expect(resolvedRole).toBe(role);
    },
  );

  it("denies an authenticated user without a role claim from role-protected logic", async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: {
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: {},
        }),
      },
    } as never);

    const resolvedRole = await signInAndGetRoleClaim(
      "norole@example.com",
      "password123",
    );

    expect(resolvedRole).toBeNull();
    expect(() => {
      assertRoleAuthorized(resolvedRole, ["ADMINISTRATOR"]);
    }).toThrow("Forbidden");
  });
});
