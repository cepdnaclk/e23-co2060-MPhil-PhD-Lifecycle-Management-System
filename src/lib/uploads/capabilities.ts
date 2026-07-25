import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  UploadPurpose,
  UploadSessionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

const PUBLIC_DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PUBLIC_DRAFT_REQUEST_LIMIT = 100;
const PUBLIC_DRAFT_CREATION_LIMIT = 20;
const PUBLIC_DRAFT_CREATION_WINDOW_MS = 60 * 60 * 1000;

export class PublicDraftCapabilityError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 410 | 429 = 403,
  ) {
    super(message);
    this.name = "PublicDraftCapabilityError";
  }
}

function hashCapabilityToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPublicApplicationDraft() {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PUBLIC_DRAFT_LIFETIME_MS);

  await prisma.uploadSession.create({
    data: {
      id,
      purpose: UploadPurpose.APPLICATION,
      idempotencyKey: `public-application-${id}`,
      capabilityTokenHash: hashCapabilityToken(token),
      expiresAt,
    },
  });

  return { draftId: id, draftToken: token, expiresAt };
}

export async function assertPublicDraftCreationRateLimit(request: Request) {
  const secret =
    process.env.PUBLIC_RATE_LIMIT_SECRET ??
    (process.env.NODE_ENV === "production"
      ? null
      : "local-public-rate-limit-secret");
  if (!secret) {
    throw new PublicDraftCapabilityError(
      "Public draft rate limiting is not configured.",
      429,
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = `${forwardedFor || "unknown"}|${request.headers.get("user-agent") || "unknown"}`;
  const keyHash = createHmac("sha256", secret).update(source).digest("hex");
  const now = new Date();
  const cutoff = new Date(now.getTime() - PUBLIC_DRAFT_CREATION_WINDOW_MS);
  const existing = await prisma.publicRequestRateLimit.findUnique({
    where: { keyHash },
  });

  if (!existing || existing.windowStart < cutoff) {
    await prisma.publicRequestRateLimit.upsert({
      where: { keyHash },
      create: { keyHash, windowStart: now, requestCount: 1 },
      update: { windowStart: now, requestCount: 1 },
    });
    return;
  }

  const incremented = await prisma.publicRequestRateLimit.updateMany({
    where: {
      keyHash,
      windowStart: { gte: cutoff },
      requestCount: { lt: PUBLIC_DRAFT_CREATION_LIMIT },
    },
    data: {
      requestCount: { increment: 1 },
    },
  });
  if (incremented.count !== 1) {
    throw new PublicDraftCapabilityError(
      "Too many public application drafts were created. Try again later.",
      429,
    );
  }
}

export async function requirePublicApplicationDraft(
  draftId: string,
  draftToken: string,
  options: { allowFinalized?: boolean; consumeRequest?: boolean } = {},
) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: draftId },
    include: { files: { orderBy: { ordinal: "asc" } } },
  });

  if (!session || session.purpose !== UploadPurpose.APPLICATION) {
    throw new PublicDraftCapabilityError("Application draft not found.", 404);
  }

  const actualHash = Buffer.from(hashCapabilityToken(draftToken), "hex");
  const expectedHash = Buffer.from(session.capabilityTokenHash ?? "", "hex");
  if (
    actualHash.length !== expectedHash.length ||
    !timingSafeEqual(actualHash, expectedHash)
  ) {
    throw new PublicDraftCapabilityError(
      "Application draft capability is invalid.",
      403,
    );
  }

  if (session.expiresAt <= new Date()) {
    await prisma.uploadSession.updateMany({
      where: { id: session.id, status: UploadSessionStatus.OPEN },
      data: { status: UploadSessionStatus.EXPIRED },
    });
    throw new PublicDraftCapabilityError("Application draft has expired.", 410);
  }

  if (
    session.status === UploadSessionStatus.FINALIZED &&
    options.allowFinalized
  ) {
    return session;
  }

  if (session.status !== UploadSessionStatus.OPEN) {
    throw new PublicDraftCapabilityError(
      "Application draft can no longer be modified.",
      409,
    );
  }

  if (options.consumeRequest !== false) {
    const consumed = await prisma.uploadSession.updateMany({
      where: {
        id: session.id,
        status: UploadSessionStatus.OPEN,
        requestCount: { lt: PUBLIC_DRAFT_REQUEST_LIMIT },
      },
      data: {
        requestCount: { increment: 1 },
        lastRequestAt: new Date(),
      },
    });
    if (consumed.count !== 1) {
      throw new PublicDraftCapabilityError(
        "Application draft request limit exceeded.",
        429,
      );
    }
  }

  return session;
}
