import { describe, expect, it, vi } from "vitest";

import {
  appendLifecycleEvent,
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";

describe("lifecycle audit", () => {
  it("writes a stable, append-only event shape through the caller transaction", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });
    const transaction = {
      lifecycleAuditEvent: { create },
    };

    await appendLifecycleEvent(transaction as never, {
      eventKey: "application:app-1:submitted",
      eventType: LIFECYCLE_EVENT.APPLICATION_SUBMITTED,
      aggregateType: "Application",
      aggregateId: "app-1",
      actorLabel: "applicant@example.com",
      newState: "SUBMITTED",
      metadata: { source: "public-application" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: "application:app-1:submitted",
        eventType: "application.submitted",
        aggregateType: "Application",
        aggregateId: "app-1",
        actorUserId: null,
        actorLabel: "applicant@example.com",
        previousState: null,
        newState: "SUBMITTED",
      }),
    });
  });

  it("uses the same transaction for audit and notification intent", async () => {
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const outboxCreate = vi.fn().mockResolvedValue({ id: "outbox-1" });
    const transaction = {
      lifecycleAuditEvent: { create: auditCreate },
      outboxMessage: { create: outboxCreate },
    };

    await appendLifecycleEventAndEnqueue(
      transaction as never,
      {
        eventKey: "application:app-1:submitted",
        eventType: LIFECYCLE_EVENT.APPLICATION_SUBMITTED,
        aggregateType: "Application",
        aggregateId: "app-1",
      },
      [
        {
          eventKey: "application:app-1:submitted:notify:admin-1",
          recipientId: "admin-1",
          title: "Application received",
          message: "A new application is ready.",
        },
      ],
    );

    expect(auditCreate).toHaveBeenCalledOnce();
    expect(outboxCreate).toHaveBeenCalledOnce();
  });
});
