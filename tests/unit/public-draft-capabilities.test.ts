import { createHash } from "node:crypto";

import { UploadPurpose, UploadSessionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    uploadSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    publicRequestRateLimit: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma/client";
import {
  createPublicApplicationDraft,
  requirePublicApplicationDraft,
} from "@/lib/uploads/capabilities";

describe("public application draft capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists only a hash of the returned capability token", async () => {
    vi.mocked(prisma.uploadSession.create).mockResolvedValue({} as never);

    const draft = await createPublicApplicationDraft();
    const createCall = vi.mocked(prisma.uploadSession.create).mock.calls[0]?.[0];

    expect(createCall?.data.capabilityTokenHash).toBe(
      createHash("sha256").update(draft.draftToken).digest("hex"),
    );
    expect(createCall?.data.capabilityTokenHash).not.toBe(draft.draftToken);
  });

  it("rejects an invalid token without consuming the draft request allowance", async () => {
    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: "draft-1",
      purpose: UploadPurpose.APPLICATION,
      status: UploadSessionStatus.OPEN,
      capabilityTokenHash: createHash("sha256")
        .update("correct-token")
        .digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      files: [],
    } as never);

    await expect(
      requirePublicApplicationDraft("draft-1", "wrong-token"),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.uploadSession.updateMany).not.toHaveBeenCalled();
  });
});
