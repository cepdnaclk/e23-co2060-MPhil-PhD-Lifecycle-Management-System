import {
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    uploadSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  STORAGE_URL_EXPIRATION_MS: 900_000,
  assertFileUploadConstraints: vi.fn(),
  deleteFile: vi.fn(),
  generateUploadSignedUrl: vi.fn(),
  normalizeStoragePath: vi.fn((path: string) => path),
  sanitizeFileName: vi.fn((name: string) => name),
}));

import { prisma } from "@/lib/prisma/client";
import { deleteFile, generateUploadSignedUrl } from "@/lib/storage";
import {
  cleanupExpiredUploadSessions,
  createStagedUploadSession,
} from "@/lib/uploads/sessions";

const auth = {
  uid: "firebase-student-1",
  firebaseUid: "firebase-student-1",
  userId: "user-student-1",
  role: UserRole.STUDENT,
};

describe("staged upload session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the finalized result for a replayed idempotency key without issuing new upload URLs", async () => {
    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: "session-1",
      ownerUserId: auth.userId,
      purpose: UploadPurpose.PROPOSAL,
      status: UploadSessionStatus.FINALIZED,
      expiresAt: new Date(Date.now() - 1),
      files: [],
    } as never);

    await expect(
      createStagedUploadSession(
        {
          purpose: UploadPurpose.PROPOSAL,
          idempotencyKey: "72910895-0d9f-4f2a-a0d9-c4998b7f0228",
          files: [
            {
              fileName: "proposal.pdf",
              mimeType: "application/pdf",
              sizeBytes: 100,
            },
          ],
        },
        auth,
        "student-1",
      ),
    ).resolves.toMatchObject({
      uploadSessionId: "session-1",
      status: UploadSessionStatus.FINALIZED,
      uploads: [],
    });

    expect(generateUploadSignedUrl).not.toHaveBeenCalled();
  });

  it("expires only unfinished sessions and never selects finalized evidence for deletion", async () => {
    vi.mocked(prisma.uploadSession.findMany).mockResolvedValue([
      {
        id: "session-open",
        files: [{ storagePath: "proposals/student-1/staged/file.pdf" }],
      },
    ] as never);
    vi.mocked(prisma.uploadSession.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(deleteFile).mockResolvedValue(undefined);

    await expect(cleanupExpiredUploadSessions()).resolves.toEqual({
      expiredSessionCount: 1,
      deletedObjectCount: 1,
    });

    expect(prisma.uploadSession.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [UploadSessionStatus.OPEN, UploadSessionStatus.FAILED],
        },
        expiresAt: { lte: expect.any(Date) },
      },
      include: { files: { select: { storagePath: true } } },
    });
  });
});
