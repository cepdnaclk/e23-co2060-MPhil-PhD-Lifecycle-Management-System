import { UploadFileStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    stagedUploadFile: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  assertApplicationAttachmentConstraints: vi.fn(),
  buildApplicationAttachmentStoragePath: vi.fn(
    (draftId: string, fileName: string) => `applications/${draftId}/${fileName}`,
  ),
  deleteFile: vi.fn(),
  generateUploadSignedUrl: vi.fn(),
  getStorageObjectOwnerId: vi.fn(
    (storagePath: string) => storagePath.split("/")[1],
  ),
  normalizeStoragePath: vi.fn((storagePath: string) => storagePath),
  sanitizeFileName: vi.fn((fileName: string) => fileName),
  StorageAccessError: class StorageAccessError extends Error {
    constructor(message: string, public readonly status = 400) {
      super(message);
    }
  },
}));

vi.mock("@/lib/uploads/capabilities", () => ({
  PublicDraftCapabilityError: class PublicDraftCapabilityError extends Error {
    constructor(message: string, public readonly status = 403) {
      super(message);
    }
  },
  requirePublicApplicationDraft: vi.fn(),
}));

vi.mock("@/lib/uploads/verification", () => ({
  assertUploadVerificationConfigured: vi.fn(),
  UploadVerificationError: class UploadVerificationError extends Error {},
  verifyStagedUploadFile: vi.fn(),
}));

import {
  createApplicationUploadUrl,
  verifyApplicationDocument,
} from "@/lib/applications/submission";
import { prisma } from "@/lib/prisma/client";
import {
  deleteFile,
  generateUploadSignedUrl,
} from "@/lib/storage";
import { requirePublicApplicationDraft } from "@/lib/uploads/capabilities";
import {
  assertUploadVerificationConfigured,
  UploadVerificationError,
  verifyStagedUploadFile,
} from "@/lib/uploads/verification";

const draftId = "d8e54622-7149-49e8-95d8-37d2d6206db5";
const draftToken = "a".repeat(43);

function stagedFile() {
  return {
    id: "file-1",
    uploadSessionId: draftId,
    ordinal: 0,
    fileName: "proposal.pdf",
    expectedMimeType: "application/pdf",
    expectedSizeBytes: 1024,
    expectedSha256: null,
    storagePath: `applications/${draftId}/staged/file-1/proposal.pdf`,
    actualMimeType: null,
    actualSizeBytes: null,
    actualSha256: null,
    status: UploadFileStatus.PENDING,
    malwareScanStatus: "PENDING" as const,
    verifiedAt: null,
    rejectionReason: null,
    documentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("public application direct uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.stagedUploadFile.create).mockResolvedValue(stagedFile());
    vi.mocked(prisma.stagedUploadFile.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.stagedUploadFile.update).mockResolvedValue(stagedFile());
    vi.mocked(deleteFile).mockResolvedValue(undefined);
    vi.mocked(assertUploadVerificationConfigured).mockReturnValue(undefined);
  });

  it("creates a signed target without sending file bytes through the application server", async () => {
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [],
    } as never);
    vi.mocked(generateUploadSignedUrl).mockResolvedValue(
      "https://storage.example.test/upload?token=signed",
    );

    const result = await createApplicationUploadUrl({
      draftId,
      draftToken,
      fileName: "proposal.pdf",
      contentType: "application/pdf",
      fileSizeBytes: 6 * 1024 * 1024,
    });

    expect(result.signedUrl).toContain("storage.example.test");
    expect(generateUploadSignedUrl).toHaveBeenCalledWith(
      expect.stringContaining(`/staged/`),
      "application/pdf",
    );
  });

  it("removes the staged database row when signed URL generation fails", async () => {
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [],
    } as never);
    vi.mocked(generateUploadSignedUrl).mockRejectedValue(new Error("offline"));

    await expect(
      createApplicationUploadUrl({
        draftId,
        draftToken,
        fileName: "proposal.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 1024,
      }),
    ).rejects.toThrow("offline");
    expect(prisma.stagedUploadFile.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ documentId: null }),
    });
  });

  it("fails before staging a file when production scanning is unavailable", async () => {
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [],
    } as never);
    vi.mocked(assertUploadVerificationConfigured).mockImplementation(() => {
      throw new UploadVerificationError("scanner missing");
    });

    await expect(
      createApplicationUploadUrl({
        draftId,
        draftToken,
        fileName: "proposal.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 1024,
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 503 }));
    expect(prisma.stagedUploadFile.create).not.toHaveBeenCalled();
  });

  it("verifies a directly uploaded object before returning its metadata", async () => {
    const file = stagedFile();
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [file],
    } as never);
    vi.mocked(verifyStagedUploadFile).mockResolvedValue({
      id: file.id,
      ordinal: 0,
      fileName: file.fileName,
      storagePath: file.storagePath,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256: "checksum",
      malwareScanStatus: "PENDING",
    });

    const result = await verifyApplicationDocument({
      draftId,
      draftToken,
      storagePath: file.storagePath,
    });

    expect(result).toMatchObject({
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(prisma.stagedUploadFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ malwareScanStatus: "PENDING" }),
      }),
    );
    expect(prisma.stagedUploadFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: UploadFileStatus.VERIFIED }),
      }),
    );
  });

  it("removes the object and staged row after verification fails", async () => {
    const file = stagedFile();
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [file],
    } as never);
    vi.mocked(verifyStagedUploadFile).mockRejectedValue(
      new UploadVerificationError("The malware scanner could not verify the file."),
    );

    await expect(
      verifyApplicationDocument({
        draftId,
        draftToken,
        storagePath: file.storagePath,
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 409 }));
    expect(deleteFile).toHaveBeenCalledWith(file.storagePath);
    expect(prisma.stagedUploadFile.deleteMany).toHaveBeenCalledWith({
      where: { id: file.id, documentId: null },
    });
  });
});
