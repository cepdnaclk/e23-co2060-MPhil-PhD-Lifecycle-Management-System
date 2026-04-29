import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  setCustomClaimsForUser: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}));

import { setCustomClaimsForUser } from "@/lib/firebase/admin";
import { syncFirebaseClaimsToUser } from "@/lib/firebase/claims";
import { prisma } from "@/lib/prisma/client";

describe("syncFirebaseClaimsToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns the intended Firebase role claim and updates firebaseUid on the user", async () => {
    vi.mocked(setCustomClaimsForUser).mockResolvedValue(undefined);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "user-1",
      firebaseUid: "firebase-1",
      role: "SUPERVISOR",
    } as never);

    const user = await syncFirebaseClaimsToUser({
      userId: "user-1",
      firebaseUid: "firebase-1",
      role: "SUPERVISOR",
    });

    expect(setCustomClaimsForUser).toHaveBeenCalledWith(
      "firebase-1",
      "SUPERVISOR",
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        firebaseUid: "firebase-1",
        role: "SUPERVISOR",
      },
    });
    expect(user.role).toBe("SUPERVISOR");
  });
});
