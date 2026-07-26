-- Remove the retired fixed-term renewal/lapse workflow. Registration remains a
-- single academic record whose expected completion date is informational.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "registrations"
    GROUP BY "studentId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Department V1 requires exactly one registration per student; reconcile duplicate registrations first';
  END IF;
END $$;

UPDATE "registrations"
SET "status" = 'ACTIVE'
WHERE "status" = 'LAPSED';

ALTER TABLE "registrations"
  RENAME COLUMN "expirationDate" TO "expectedCompletionDate";

ALTER TABLE "registrations"
  DROP COLUMN "studyMode",
  DROP COLUMN "durationMonths",
  DROP COLUMN "isFixedTerm";

DROP INDEX IF EXISTS "registrations_studentId_status_idx";
CREATE UNIQUE INDEX "registrations_studentId_key"
  ON "registrations"("studentId");
CREATE INDEX "registrations_status_idx"
  ON "registrations"("status");

ALTER TYPE "RegistrationStatus" RENAME TO "RegistrationStatus_old";
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
ALTER TABLE "registrations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "registrations"
  ALTER COLUMN "status" TYPE "RegistrationStatus"
  USING ("status"::text::"RegistrationStatus");
ALTER TABLE "registrations" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "RegistrationStatus_old";

ALTER TYPE "ThesisStatus"
  RENAME VALUE 'FINAL_ARCHIVE' TO 'ARCHIVED';

-- Preserve historical messages while removing retired sign-off and expiry
-- event labels from the active domain vocabulary.
ALTER TYPE "NotificationEvent" RENAME TO "NotificationEvent_old";
CREATE TYPE "NotificationEvent" AS ENUM (
  'APPLICATION_STATUS_CHANGED',
  'PROPOSAL_STATUS_CHANGED',
  'ETHICS_APPROVAL_SUBMITTED',
  'ETHICS_APPROVAL_STATUS_CHANGED',
  'PROGRESS_REPORT_SUBMITTED',
  'SUPERVISOR_SUBMISSION_AVAILABLE',
  'EXAMINER_REVIEW_ASSIGNED',
  'EXAMINER_REVIEW_SUBMITTED',
  'ADMIN_REVIEW_RELEASED',
  'THESIS_DOWNLOADED',
  'THESIS_STATUS_CHANGED',
  'VIVA_SCHEDULED',
  'CORRECTIONS_REQUIRED',
  'PROGRAMME_COMPLETION_STATUS_CHANGED',
  'GRADUATION_RECORDED',
  'RECORD_ARCHIVED',
  'THESIS_ARCHIVED',
  'SYSTEM_NOTICE'
);

ALTER TABLE "notifications"
  ALTER COLUMN "event" TYPE "NotificationEvent"
  USING (
    CASE
      WHEN "event"::text IN (
        'PROGRESS_REPORT_SIGNED_OFF',
        'REGISTRATION_EXPIRY_APPROACHING'
      ) THEN 'SYSTEM_NOTICE'
      ELSE "event"::text
    END
  )::"NotificationEvent";

ALTER TABLE "notification_logs"
  ALTER COLUMN "event" TYPE "NotificationEvent"
  USING (
    CASE
      WHEN "event"::text IN (
        'PROGRESS_REPORT_SIGNED_OFF',
        'REGISTRATION_EXPIRY_APPROACHING'
      ) THEN 'SYSTEM_NOTICE'
      ELSE "event"::text
    END
  )::"NotificationEvent";

ALTER TABLE "outbox_messages"
  ALTER COLUMN "notificationEvent" TYPE "NotificationEvent"
  USING (
    CASE
      WHEN "notificationEvent"::text IN (
        'PROGRESS_REPORT_SIGNED_OFF',
        'REGISTRATION_EXPIRY_APPROACHING'
      ) THEN 'SYSTEM_NOTICE'
      ELSE "notificationEvent"::text
    END
  )::"NotificationEvent";

DROP TYPE "NotificationEvent_old";
