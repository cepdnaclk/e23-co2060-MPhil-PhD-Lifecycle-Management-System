import { randomUUID } from "node:crypto";

import {
  MalwareScanStatus,
  UploadFileStatus,
  UploadPurpose,
  UploadSessionStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  deleteFile,
  generateUploadSignedUrl,
  normalizeStoragePath,
  sanitizeFileName,
  STORAGE_URL_EXPIRATION_MS,
} from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";
import {
  createUploadSessionSchema,
  type StagedUploadFileInput,
} from "@/lib/uploads/schemas";
import {
  buildEvidenceManifestHash,
  UploadVerificationError,
  verifyStagedUploadFile,
  type VerifiedUploadFile,
} from "@/lib/uploads/verification";

const SESSION_LIFETIME_MS = 60 * 60 * 1000;

const PURPOSE_ROOT: Record<UploadPurpose, string> = {
  APPLICATION: "applications",
  PROPOSAL: "proposals",
  ETHICS_APPROVAL: "ethics-approvals",
  PROGRESS_REPORT: "progress-reports",
  THESIS: "theses",
  CORRECTION: "corrections",
  REVIEW_ATTACHMENT: "review-attachments",
};

export class UploadSessionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "UploadSessionError";
  }
}

type CreateSessionInput = {
  purpose: UploadPurpose;
  idempotencyKey: string;
  files: StagedUploadFileInput[];
};

function buildSealedStoragePath(input: {
  purpose: UploadPurpose;
  ownerScopeId: string;
  sessionId: string;
  fileId: string;
  fileName: string;
}) {
  return normalizeStoragePath(
    `${PURPOSE_ROOT[input.purpose]}/${input.ownerScopeId}/staged/${input.sessionId}/${input.fileId}/${sanitizeFileName(input.fileName)}`,
  );
}

async function mapSessionUploadTargets(session: {
  id: string;
  purpose: UploadPurpose;
  status: UploadSessionStatus;
  expiresAt: Date;
  files: Array<{
    id: string;
    ordinal: number;
    fileName: string;
    expectedMimeType: string;
    storagePath: string;
    status: UploadFileStatus;
  }>;
}) {
  const uploads = await Promise.all(
    session.files.map(async (file) => ({
      fileId: file.id,
      ordinal: file.ordinal,
      fileName: file.fileName,
      storagePath: file.storagePath,
      status: file.status,
      signedUrl:
        file.status === UploadFileStatus.PENDING
          ? await generateUploadSignedUrl(
              file.storagePath,
              file.expectedMimeType,
            )
          : null,
    })),
  );

  return {
    uploadSessionId: session.id,
    purpose: session.purpose,
    status: session.status,
    expiresAt: session.expiresAt,
    expiresInMinutes: STORAGE_URL_EXPIRATION_MS / (60 * 1000),
    uploads,
  };
}

export async function createStagedUploadSession(
  input: CreateSessionInput,
  auth: AuthenticatedUserContext,
  ownerScopeId: string,
) {
  const parsed = createUploadSessionSchema.safeParse(input);
  if (!parsed.success) {
    throw new UploadSessionError(
      parsed.error.issues[0]?.message ?? "Invalid upload session request.",
      400,
    );
  }

  const existing = await prisma.uploadSession.findUnique({
    where: { idempotencyKey: parsed.data.idempotencyKey },
    include: { files: { orderBy: { ordinal: "asc" } } },
  });

  if (existing) {
    if (
      existing.ownerUserId !== auth.userId ||
      existing.purpose !== parsed.data.purpose
    ) {
      throw new UploadSessionError(
        "The idempotency key is already used by another upload.",
        409,
      );
    }

    if (existing.status === UploadSessionStatus.FINALIZED) {
      return {
        uploadSessionId: existing.id,
        purpose: existing.purpose,
        status: existing.status,
        expiresAt: existing.expiresAt,
        expiresInMinutes: 0,
        uploads: [],
      };
    }

    if (
      existing.status !== UploadSessionStatus.OPEN ||
      existing.expiresAt <= new Date()
    ) {
      throw new UploadSessionError(
        "The existing upload session can no longer accept files.",
        410,
      );
    }

    return mapSessionUploadTargets(existing);
  }

  for (const file of parsed.data.files) {
    assertFileUploadConstraints({
      contentType: file.mimeType,
      fileSizeBytes: file.sizeBytes,
      path: `${PURPOSE_ROOT[parsed.data.purpose]}/validation/${sanitizeFileName(file.fileName)}`,
    });
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const files = parsed.data.files.map((file, ordinal) => {
    const fileId = randomUUID();
    return {
      id: fileId,
      ordinal,
      fileName: file.fileName,
      expectedMimeType: file.mimeType,
      expectedSizeBytes: file.sizeBytes,
      expectedSha256: file.sha256,
      storagePath: buildSealedStoragePath({
        purpose: parsed.data.purpose,
        ownerScopeId,
        sessionId,
        fileId,
        fileName: file.fileName,
      }),
    };
  });

  const session = await prisma.uploadSession.create({
    data: {
      id: sessionId,
      ownerUserId: auth.userId,
      purpose: parsed.data.purpose,
      idempotencyKey: parsed.data.idempotencyKey,
      expiresAt,
      files: { create: files },
    },
    include: { files: { orderBy: { ordinal: "asc" } } },
  });

  return mapSessionUploadTargets(session);
}

export type VerifiedUploadSession = {
  id: string;
  files: VerifiedUploadFile[];
  manifestHash: string;
};

export async function verifyUploadSessionForFinalize(
  uploadSessionId: string,
  purpose: UploadPurpose,
  auth: AuthenticatedUserContext,
): Promise<
  | { state: "FINALIZED"; finalizedEntityId: string; result: Prisma.JsonValue }
  | { state: "VERIFIED"; session: VerifiedUploadSession }
> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadSessionId },
    include: { files: { orderBy: { ordinal: "asc" } } },
  });

  if (!session) {
    throw new UploadSessionError("Upload session not found.", 404);
  }

  if (session.ownerUserId !== auth.userId || session.purpose !== purpose) {
    throw new UploadSessionError("Upload session access denied.", 403);
  }

  if (
    session.status === UploadSessionStatus.FINALIZED &&
    session.finalizedEntityId
  ) {
    return {
      state: "FINALIZED",
      finalizedEntityId: session.finalizedEntityId,
      result: session.result ?? {},
    };
  }

  if (session.expiresAt <= new Date()) {
    await prisma.uploadSession.updateMany({
      where: { id: session.id, status: UploadSessionStatus.OPEN },
      data: { status: UploadSessionStatus.EXPIRED },
    });
    throw new UploadSessionError("Upload session has expired.", 410);
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: { id: session.id, status: UploadSessionStatus.OPEN },
    data: { status: UploadSessionStatus.FINALIZING, failureReason: null },
  });
  if (claimed.count !== 1) {
    throw new UploadSessionError(
      "Upload session is already being finalized or cannot be retried.",
      409,
    );
  }

  try {
    const verifiedFiles: VerifiedUploadFile[] = [];
    for (const file of session.files) {
      try {
        const verified = await verifyStagedUploadFile(file);
        verifiedFiles.push(verified);
        await prisma.stagedUploadFile.update({
          where: { id: file.id },
          data: {
            actualMimeType: verified.mimeType,
            actualSizeBytes: verified.sizeBytes,
            actualSha256: verified.checksumSha256,
            status: UploadFileStatus.VERIFIED,
            malwareScanStatus: MalwareScanStatus.CLEAN,
            verifiedAt: new Date(),
            rejectionReason: null,
          },
        });
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "File verification failed.";
        await prisma.stagedUploadFile.update({
          where: { id: file.id },
          data: {
            status: UploadFileStatus.REJECTED,
            malwareScanStatus:
              error instanceof UploadVerificationError &&
              /malware safety check/i.test(error.message)
                ? MalwareScanStatus.INFECTED
                : MalwareScanStatus.ERROR,
            rejectionReason: reason,
          },
        });
        throw error;
      }
    }

    return {
      state: "VERIFIED",
      session: {
        id: session.id,
        files: verifiedFiles,
        manifestHash: buildEvidenceManifestHash(verifiedFiles),
      },
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Upload verification failed.";
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: {
        status: UploadSessionStatus.FAILED,
        failureReason: reason,
      },
    });
    throw new UploadSessionError(reason, 409);
  }
}

export async function reopenUploadSessionAfterFinalizeFailure(
  uploadSessionId: string,
  reason: string,
) {
  await prisma.uploadSession.updateMany({
    where: {
      id: uploadSessionId,
      status: UploadSessionStatus.FINALIZING,
    },
    data: {
      status: UploadSessionStatus.OPEN,
      failureReason: reason.slice(0, 1000),
    },
  });
}

export async function abortUploadSession(
  uploadSessionId: string,
  auth: AuthenticatedUserContext,
) {
  const session = await prisma.uploadSession.findFirst({
    where: {
      id: uploadSessionId,
      ownerUserId: auth.userId,
      status: { in: [UploadSessionStatus.OPEN, UploadSessionStatus.FAILED] },
    },
    include: { files: { select: { storagePath: true } } },
  });
  if (!session) {
    throw new UploadSessionError(
      "Upload session cannot be aborted or was not found.",
      409,
    );
  }

  const result = await prisma.uploadSession.updateMany({
    where: {
      id: uploadSessionId,
      ownerUserId: auth.userId,
      status: { in: [UploadSessionStatus.OPEN, UploadSessionStatus.FAILED] },
    },
    data: {
      status: UploadSessionStatus.ABORTED,
      abortedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new UploadSessionError(
      "Upload session cannot be aborted or was not found.",
      409,
    );
  }

  await Promise.allSettled(
    session.files.map((file) => deleteFile(file.storagePath)),
  );
}

export async function cleanupExpiredUploadSessions(now = new Date()) {
  const sessions = await prisma.uploadSession.findMany({
    where: {
      status: {
        in: [UploadSessionStatus.OPEN, UploadSessionStatus.FAILED],
      },
      expiresAt: { lte: now },
    },
    include: { files: { select: { storagePath: true } } },
  });

  let deletedObjectCount = 0;
  for (const session of sessions) {
    for (const file of session.files) {
      try {
        await deleteFile(file.storagePath);
        deletedObjectCount += 1;
      } catch {
        // Keep expiring the database session; a later storage reconciliation can
        // retry an object that the provider did not remove.
      }
    }
  }

  const expired = await prisma.uploadSession.updateMany({
    where: {
      id: { in: sessions.map((session) => session.id) },
      status: {
        in: [UploadSessionStatus.OPEN, UploadSessionStatus.FAILED],
      },
    },
    data: { status: UploadSessionStatus.EXPIRED },
  });

  return {
    expiredSessionCount: expired.count,
    deletedObjectCount,
  };
}
