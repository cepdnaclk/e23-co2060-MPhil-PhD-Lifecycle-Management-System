import { createHash } from "node:crypto";

import { UploadPurpose, UploadSessionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    uploadSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
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
  loadPublicApplicationDraft,
  requirePublicApplicationDraft,
  savePublicApplicationDraft,
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

  it("stores typed application fields behind the protected draft capability", async () => {
    const draftToken = "correct-token-with-at-least-thirty-two-characters";
    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      purpose: UploadPurpose.APPLICATION,
      status: UploadSessionStatus.OPEN,
      capabilityTokenHash: createHash("sha256").update(draftToken).digest("hex"),
      expiresAt: new Date("2026-08-02T10:00:00.000Z"),
      files: [],
      result: null,
    } as never);
    vi.mocked(prisma.uploadSession.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.uploadSession.update).mockResolvedValue({} as never);

    const saved = await savePublicApplicationDraft({
      draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      draftToken,
      currentStep: 1,
      furthestStep: 1,
      values: {
        applicantName: "Jane Doe",
        applicantEmail: "jane@example.com",
        applicantPhone: "+94771234567",
        programType: "MPHIL",
        studyMode: "FULL_TIME",
        proposalTitle: "Adaptive learning",
        proposalAbstract: "A protected draft abstract",
        proposedSupervisorId: "supervisor-1",
        researchArea: "Education technology",
        supervisor: "",
        statementOfPurpose: "Research motivation",
      },
    });

    expect(saved.savedAt).toEqual(expect.any(String));
    expect(prisma.uploadSession.update).toHaveBeenCalledWith({
      where: { id: "d8e54622-7149-49e8-95d8-37d2d6206db5" },
      data: {
        result: {
          draft: expect.objectContaining({
            currentStep: 1,
            values: expect.objectContaining({ applicantName: "Jane Doe" }),
          }),
        },
      },
    });
  });

  it("restores saved fields and verified uploads without consuming a request", async () => {
    const draftToken = "correct-token-with-at-least-thirty-two-characters";
    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      purpose: UploadPurpose.APPLICATION,
      status: UploadSessionStatus.OPEN,
      capabilityTokenHash: createHash("sha256").update(draftToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      files: [{
        fileName: "proposal.pdf",
        storagePath: "applications/draft/staged/file/proposal.pdf",
        actualMimeType: "application/pdf",
        actualSizeBytes: 2048,
      }],
      result: {
        draft: {
          currentStep: 1,
          furthestStep: 2,
          savedAt: "2026-08-01T10:00:00.000Z",
          values: {
            applicantName: "Jane Doe",
            applicantEmail: "jane@example.com",
            applicantPhone: "+94771234567",
            programType: "MPHIL",
            studyMode: "FULL_TIME",
            proposalTitle: "Adaptive learning",
            proposalAbstract: "A protected draft abstract",
            proposedSupervisorId: "supervisor-1",
            researchArea: "Education technology",
            supervisor: "",
            statementOfPurpose: "Research motivation",
          },
        },
      },
    } as never);

    const restored = await loadPublicApplicationDraft({
      draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      draftToken,
    });

    expect(restored.draft?.values.applicantName).toBe("Jane Doe");
    expect(restored.documents).toEqual([
      expect.objectContaining({ fileName: "proposal.pdf", sizeBytes: 2048 }),
    ]);
    expect(prisma.uploadSession.updateMany).not.toHaveBeenCalled();
  });
});
