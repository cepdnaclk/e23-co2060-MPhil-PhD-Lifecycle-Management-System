import {
  NotificationEvent,
  OutboxStatus,
  Prisma,
  type OutboxMessage,
} from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;
const STALE_LEASE_MILLISECONDS = 10 * 60 * 1_000;
const MAX_BACKOFF_MILLISECONDS = 60 * 60 * 1_000;

export const OUTBOX_TOPIC = {
  USER_NOTIFICATION: "user.notification",
} as const;

type EmailDeliveryPayload = {
  email?: {
    to: string;
    subject: string;
    html: string;
    text: string;
  };
};

export type EnqueueOutboxInput = {
  eventKey: string;
  topic?: (typeof OUTBOX_TOPIC)[keyof typeof OUTBOX_TOPIC] | (string & {});
  recipientId?: string | null;
  studentId?: string | null;
  notificationEvent?: NotificationEvent | null;
  title?: string | null;
  message?: string | null;
  actionUrl?: string | null;
  payload?: Prisma.InputJsonValue;
  maxAttempts?: number;
  availableAt?: Date;
};

type OutboxWriter = Pick<Prisma.TransactionClient, "outboxMessage">;

export function enqueueOutboxMessage(
  transaction: OutboxWriter,
  input: EnqueueOutboxInput,
) {
  const maxAttempts =
    input.maxAttempts &&
    Number.isInteger(input.maxAttempts) &&
    input.maxAttempts > 0
      ? input.maxAttempts
      : DEFAULT_MAX_ATTEMPTS;

  return transaction.outboxMessage.create({
    data: {
      eventKey: input.eventKey,
      topic: input.topic ?? OUTBOX_TOPIC.USER_NOTIFICATION,
      recipientId: input.recipientId ?? null,
      studentId: input.studentId ?? null,
      notificationEvent: input.notificationEvent ?? null,
      title: input.title ?? null,
      message: input.message ?? null,
      actionUrl: input.actionUrl ?? null,
      payload: input.payload ?? {},
      maxAttempts,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    },
  });
}

function parseDeliveryPayload(payload: Prisma.JsonValue): EmailDeliveryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const email = payload.email;

  if (!email || typeof email !== "object" || Array.isArray(email)) {
    return {};
  }

  const fields = ["to", "subject", "html", "text"] as const;

  if (!fields.every((field) => typeof email[field] === "string")) {
    throw new Error("Outbox email payload is invalid.");
  }

  return {
    email: {
      to: email.to as string,
      subject: email.subject as string,
      html: email.html as string,
      text: email.text as string,
    },
  };
}

function retryDelay(attempt: number) {
  return Math.min(2 ** Math.max(attempt - 1, 0) * 60_000, MAX_BACKOFF_MILLISECONDS);
}

async function deliverClaimedMessage(message: OutboxMessage) {
  const payload = parseDeliveryPayload(message.payload);

  if (
    message.recipientId &&
    message.notificationEvent &&
    message.title &&
    message.message
  ) {
    await prisma.notification.upsert({
      where: { outboxMessageId: message.id },
      create: {
        recipientId: message.recipientId,
        studentId: message.studentId,
        event: message.notificationEvent,
        title: message.title,
        message: message.message,
        actionUrl: message.actionUrl,
        outboxMessageId: message.id,
      },
      update: {},
    });
  }

  if (payload.email) {
    if (!message.recipientId || !message.notificationEvent) {
      throw new Error(
        "Email outbox messages require a recipient and notification event.",
      );
    }

    const result = await sendEmail({
      ...payload.email,
      recipientUserId: message.recipientId,
      event: message.notificationEvent,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Email delivery failed.");
    }
  }
}

async function finishDelivery(
  message: OutboxMessage,
  error?: unknown,
) {
  const attempt = message.attempts + 1;
  const errorMessage =
    error instanceof Error ? error.message.slice(0, 2_000) : "Unknown delivery error.";
  const deadLettered = Boolean(error) && attempt >= message.maxAttempts;
  const now = new Date();

  await prisma.$transaction([
    prisma.outboxDeliveryAttempt.create({
      data: {
        outboxId: message.id,
        attempt,
        succeeded: !error,
        errorMessage: error ? errorMessage : null,
        completedAt: now,
      },
    }),
    prisma.outboxMessage.update({
      where: {
        id: message.id,
        status: OutboxStatus.PROCESSING,
        lockedBy: message.lockedBy,
      },
      data: error
        ? {
            status: deadLettered
              ? OutboxStatus.DEAD_LETTER
              : OutboxStatus.FAILED,
            attempts: attempt,
            availableAt: new Date(now.getTime() + retryDelay(attempt)),
            lockedAt: null,
            lockedBy: null,
            lastError: errorMessage,
          }
        : {
            status: OutboxStatus.DELIVERED,
            attempts: attempt,
            deliveredAt: now,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
    }),
  ]);
}

async function claimMessage(id: string, workerId: string) {
  const claimed = await prisma.outboxMessage.updateMany({
    where: {
      id,
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      availableAt: { lte: new Date() },
    },
    data: {
      status: OutboxStatus.PROCESSING,
      lockedAt: new Date(),
      lockedBy: workerId,
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.outboxMessage.findUnique({ where: { id } });
}

export type ProcessOutboxResult = {
  claimed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  recoveredStaleLeases: number;
};

export async function processOutboxBatch(input: {
  workerId: string;
  batchSize?: number;
}): Promise<ProcessOutboxResult> {
  const batchSize = Math.max(
    1,
    Math.min(Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE), 100),
  );
  const staleBefore = new Date(Date.now() - STALE_LEASE_MILLISECONDS);
  const recovered = await prisma.outboxMessage.updateMany({
    where: {
      status: OutboxStatus.PROCESSING,
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: OutboxStatus.FAILED,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "Recovered after a stale worker lease.",
    },
  });
  const candidates = await prisma.outboxMessage.findMany({
    where: {
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      availableAt: { lte: new Date() },
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
    select: { id: true },
  });
  const result: ProcessOutboxResult = {
    claimed: 0,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    recoveredStaleLeases: recovered.count,
  };

  for (const candidate of candidates) {
    const message = await claimMessage(candidate.id, input.workerId);

    if (!message) {
      continue;
    }

    result.claimed += 1;

    try {
      await deliverClaimedMessage(message);
      await finishDelivery(message);
      result.delivered += 1;
    } catch (error) {
      await finishDelivery(message, error);

      if (message.attempts + 1 >= message.maxAttempts) {
        result.deadLettered += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

export async function retryOutboxMessage(id: string) {
  const result = await prisma.outboxMessage.updateMany({
    where: {
      id,
      status: { in: [OutboxStatus.FAILED, OutboxStatus.DEAD_LETTER] },
    },
    data: {
      status: OutboxStatus.PENDING,
      attempts: 0,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      deliveredAt: null,
    },
  });

  return result.count === 1;
}

export async function listOutboxMessages(input: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const validStatus = Object.values(OutboxStatus).find(
    (status) => status === input.status,
  );
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 50), 100));
  const where: Prisma.OutboxMessageWhereInput = validStatus
    ? { status: validStatus }
    : {};
  const [messages, total] = await Promise.all([
    prisma.outboxMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventKey: true,
        topic: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        availableAt: true,
        lastError: true,
        recipient: {
          select: {
            displayName: true,
            email: true,
          },
        },
        createdAt: true,
        deliveredAt: true,
      },
    }),
    prisma.outboxMessage.count({ where }),
  ]);

  return {
    messages,
    total,
    page,
    pageCount: Math.ceil(total / limit),
  };
}
