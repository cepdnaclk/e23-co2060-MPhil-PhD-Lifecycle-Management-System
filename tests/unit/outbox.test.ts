import {
  NotificationEvent,
  OutboxStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    notification: {
      upsert: vi.fn(),
    },
    outboxDeliveryAttempt: {
      create: vi.fn(),
    },
    outboxMessage: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma/client";
import {
  enqueueOutboxMessage,
  processOutboxBatch,
  retryOutboxMessage,
} from "@/lib/outbox/service";

function outboxMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbox-1",
    eventKey: "application:app-1:submitted:notify:admin-1",
    topic: "user.notification",
    recipientId: null,
    studentId: null,
    notificationEvent: null,
    title: null,
    message: null,
    actionUrl: null,
    payload: {},
    status: OutboxStatus.PROCESSING,
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "worker-1",
    lastError: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("transactional outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    vi.mocked(prisma.outboxDeliveryAttempt.create).mockResolvedValue({} as never);
    vi.mocked(prisma.outboxMessage.update).mockResolvedValue({} as never);
  });

  it("enqueues using the caller transaction and an idempotent event key", async () => {
    const create = vi.fn().mockResolvedValue({ id: "outbox-1" });

    await enqueueOutboxMessage({ outboxMessage: { create } } as never, {
      eventKey: "application:app-1:submitted:notify:admin-1",
      recipientId: "admin-1",
      notificationEvent: NotificationEvent.APPLICATION_STATUS_CHANGED,
      title: "Application received",
      message: "A new application is ready.",
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: "application:app-1:submitted:notify:admin-1",
        recipientId: "admin-1",
        maxAttempts: 5,
        payload: {},
      }),
    });
  });

  it("claims once and creates the in-app notification idempotently", async () => {
    vi.mocked(prisma.outboxMessage.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.outboxMessage.findMany).mockResolvedValue([
      { id: "outbox-1" },
    ] as never);
    vi.mocked(prisma.outboxMessage.findUnique).mockResolvedValue(
      outboxMessage({
        recipientId: "admin-1",
        notificationEvent: NotificationEvent.APPLICATION_STATUS_CHANGED,
        title: "Application received",
        message: "A new application is ready.",
      }) as never,
    );
    vi.mocked(prisma.notification.upsert).mockResolvedValue({} as never);

    const result = await processOutboxBatch({ workerId: "worker-1" });

    expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { outboxMessageId: "outbox-1" },
        update: {},
      }),
    );
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.DELIVERED }),
      }),
    );
  });

  it("dead-letters a malformed delivery after its final attempt", async () => {
    vi.mocked(prisma.outboxMessage.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.outboxMessage.findMany).mockResolvedValue([
      { id: "outbox-1" },
    ] as never);
    vi.mocked(prisma.outboxMessage.findUnique).mockResolvedValue(
      outboxMessage({
        maxAttempts: 1,
        payload: { email: { to: 42 } },
      }) as never,
    );

    const result = await processOutboxBatch({ workerId: "worker-1" });

    expect(result.deadLettered).toBe(1);
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboxStatus.DEAD_LETTER,
          attempts: 1,
        }),
      }),
    );
  });

  it("allows only failed or dead-letter records to be manually requeued", async () => {
    vi.mocked(prisma.outboxMessage.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    await expect(retryOutboxMessage("outbox-1")).resolves.toBe(true);
    expect(prisma.outboxMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [OutboxStatus.FAILED, OutboxStatus.DEAD_LETTER],
          },
        }),
        data: expect.objectContaining({
          status: OutboxStatus.PENDING,
          attempts: 0,
        }),
      }),
    );
  });
});
