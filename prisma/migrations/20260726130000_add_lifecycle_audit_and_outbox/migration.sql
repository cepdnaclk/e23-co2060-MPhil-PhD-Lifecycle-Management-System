-- Department PGLMS V1: append-only lifecycle audit and transactional outbox.
CREATE TYPE "OutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER'
);

ALTER TABLE "notifications"
  ADD COLUMN "actionUrl" TEXT,
  ADD COLUMN "outboxMessageId" TEXT;

CREATE TABLE "lifecycle_audit_events" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "actorLabel" TEXT,
  "previousState" TEXT,
  "newState" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_messages" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "recipientId" TEXT,
  "studentId" TEXT,
  "notificationEvent" "NotificationEvent",
  "title" TEXT,
  "message" TEXT,
  "actionUrl" TEXT,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_delivery_attempts" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "succeeded" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_outboxMessageId_key"
  ON "notifications"("outboxMessageId");
CREATE UNIQUE INDEX "lifecycle_audit_events_eventKey_key"
  ON "lifecycle_audit_events"("eventKey");
CREATE INDEX "lifecycle_audit_events_aggregateType_aggregateId_occurredAt_idx"
  ON "lifecycle_audit_events"("aggregateType", "aggregateId", "occurredAt");
CREATE INDEX "lifecycle_audit_events_eventType_occurredAt_idx"
  ON "lifecycle_audit_events"("eventType", "occurredAt");
CREATE INDEX "lifecycle_audit_events_actorUserId_occurredAt_idx"
  ON "lifecycle_audit_events"("actorUserId", "occurredAt");
CREATE UNIQUE INDEX "outbox_messages_eventKey_key"
  ON "outbox_messages"("eventKey");
CREATE INDEX "outbox_messages_status_availableAt_createdAt_idx"
  ON "outbox_messages"("status", "availableAt", "createdAt");
CREATE INDEX "outbox_messages_recipientId_createdAt_idx"
  ON "outbox_messages"("recipientId", "createdAt");
CREATE INDEX "outbox_messages_topic_createdAt_idx"
  ON "outbox_messages"("topic", "createdAt");
CREATE UNIQUE INDEX "outbox_delivery_attempts_outboxId_attempt_key"
  ON "outbox_delivery_attempts"("outboxId", "attempt");
CREATE INDEX "outbox_delivery_attempts_succeeded_completedAt_idx"
  ON "outbox_delivery_attempts"("succeeded", "completedAt");

ALTER TABLE "lifecycle_audit_events"
  ADD CONSTRAINT "lifecycle_audit_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_messages"
  ADD CONSTRAINT "outbox_messages_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_messages"
  ADD CONSTRAINT "outbox_messages_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_outboxMessageId_fkey"
  FOREIGN KEY ("outboxMessageId") REFERENCES "outbox_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_delivery_attempts"
  ADD CONSTRAINT "outbox_delivery_attempts_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "outbox_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain audit history is insert-only even for database users that can write
-- ordinary application tables. A later compensating event records corrections.
CREATE OR REPLACE FUNCTION prevent_lifecycle_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lifecycle audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lifecycle_audit_events_append_only"
BEFORE UPDATE OR DELETE ON "lifecycle_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_lifecycle_audit_mutation();
