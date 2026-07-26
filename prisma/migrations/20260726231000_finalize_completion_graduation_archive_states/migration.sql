-- Finalize Department V1 completion, graduation, and archive as distinct
-- lifecycle states bound to one exact verified thesis version.

ALTER TYPE "AcademicStatus" RENAME TO "AcademicStatus_old";
CREATE TYPE "AcademicStatus" AS ENUM (
  'ACTIVE',
  'UNDER_REVIEW',
  'COMPLETED',
  'GRADUATED',
  'ARCHIVED',
  'FAILED'
);
ALTER TABLE "students" ALTER COLUMN "academicStatus" DROP DEFAULT;
ALTER TABLE "students"
  ALTER COLUMN "academicStatus" TYPE "AcademicStatus"
  USING ("academicStatus"::text::"AcademicStatus");
ALTER TABLE "students" ALTER COLUMN "academicStatus" SET DEFAULT 'ACTIVE';
DROP TYPE "AcademicStatus_old";

ALTER TYPE "RegistrationStatus" RENAME TO "RegistrationStatus_old";
CREATE TYPE "RegistrationStatus" AS ENUM (
  'ACTIVE',
  'LAPSED',
  'COMPLETED',
  'ARCHIVED'
);
ALTER TABLE "registrations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "registrations"
  ALTER COLUMN "status" TYPE "RegistrationStatus"
  USING ("status"::text::"RegistrationStatus");
ALTER TABLE "registrations" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "RegistrationStatus_old";

ALTER TYPE "ThesisStatus" RENAME TO "ThesisStatus_old";
CREATE TYPE "ThesisStatus" AS ENUM (
  'SUBMITTED',
  'UNDER_EXAMINATION',
  'CORRECTIONS_REQUIRED',
  'CORRECTIONS_APPROVED',
  'COMPLETED',
  'FINAL_ARCHIVE',
  'CLOSED'
);
ALTER TABLE "theses" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "theses"
  ALTER COLUMN "status" TYPE "ThesisStatus"
  USING ("status"::text::"ThesisStatus");
ALTER TABLE "theses" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
DROP TYPE "ThesisStatus_old";

ALTER TYPE "NotificationEvent"
  ADD VALUE IF NOT EXISTS 'PROGRAMME_COMPLETION_STATUS_CHANGED';
ALTER TYPE "NotificationEvent"
  ADD VALUE IF NOT EXISTS 'GRADUATION_RECORDED';
ALTER TYPE "NotificationEvent"
  ADD VALUE IF NOT EXISTS 'RECORD_ARCHIVED';

ALTER TABLE "registrations"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "programme_completions"
  ADD COLUMN "thesisVersionId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "graduation_records"
  ADD COLUMN "confirmationReference" TEXT;

-- Every existing completion must bind unambiguously to the thesis version that
-- was current when this migration is introduced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "programme_completions" AS completion
    WHERE (
      SELECT COUNT(*)
      FROM "thesis_versions" AS version
      WHERE version."thesisId" = completion."thesisId"
        AND version."isCurrent" = true
    ) <> 1
  ) THEN
    RAISE EXCEPTION 'Each programme completion requires exactly one current thesis version before migration';
  END IF;
END $$;

UPDATE "programme_completions" AS completion
SET "thesisVersionId" = version."id"
FROM "thesis_versions" AS version
WHERE version."thesisId" = completion."thesisId"
  AND version."isCurrent" = true;

UPDATE "graduation_records"
SET "confirmationReference" = 'Legacy Department graduation record'
WHERE "confirmationReference" IS NULL;

ALTER TABLE "programme_completions"
  ALTER COLUMN "thesisVersionId" SET NOT NULL;
ALTER TABLE "graduation_records"
  ALTER COLUMN "confirmationReference" SET NOT NULL;

CREATE UNIQUE INDEX "programme_completions_thesisVersionId_key"
  ON "programme_completions"("thesisVersionId");

ALTER TABLE "programme_completions"
  ADD CONSTRAINT "programme_completions_thesisVersionId_fkey"
  FOREIGN KEY ("thesisVersionId")
  REFERENCES "thesis_versions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Replace the operational ADMIN_RECORDED label with the academic lifecycle
-- state COMPLETED while preserving any existing records.
ALTER TYPE "CompletionStatus" RENAME TO "CompletionStatus_old";
CREATE TYPE "CompletionStatus" AS ENUM ('PENDING', 'HOD_APPROVED', 'COMPLETED');
ALTER TABLE "programme_completions"
  ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "programme_completions"
  ALTER COLUMN "status" TYPE "CompletionStatus"
  USING (
    CASE
      WHEN "status"::text = 'ADMIN_RECORDED' THEN 'COMPLETED'
      ELSE "status"::text
    END
  )::"CompletionStatus";
ALTER TABLE "programme_completions"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "CompletionStatus_old";

UPDATE "programme_completions"
SET "completedAt" = COALESCE("adminRecordedAt", "updatedAt")
WHERE "status" = 'COMPLETED'
  AND "completedAt" IS NULL;

UPDATE "students" AS student
SET "academicStatus" = 'COMPLETED'
FROM "programme_completions" AS completion
WHERE completion."studentId" = student."id"
  AND completion."status" = 'COMPLETED'
  AND student."academicStatus" NOT IN ('GRADUATED', 'ARCHIVED');

UPDATE "registrations" AS registration
SET
  "status" = 'COMPLETED',
  "completedAt" = completion."completedAt"
FROM "programme_completions" AS completion
WHERE completion."studentId" = registration."studentId"
  AND completion."status" = 'COMPLETED'
  AND registration."status" IN ('ACTIVE', 'LAPSED');

UPDATE "theses" AS thesis
SET "status" = 'COMPLETED'
FROM "programme_completions" AS completion
WHERE completion."thesisId" = thesis."id"
  AND completion."status" = 'COMPLETED'
  AND thesis."status" IN ('UNDER_EXAMINATION', 'CORRECTIONS_APPROVED');

UPDATE "registrations" AS registration
SET
  "status" = 'ARCHIVED',
  "archivedAt" = archive."archivedAt"
FROM "student_archive_records" AS archive
WHERE archive."studentId" = registration."studentId"
  AND archive."status" = 'ARCHIVED';

UPDATE "theses" AS thesis
SET
  "status" = 'FINAL_ARCHIVE',
  "isArchived" = true
FROM "programme_completions" AS completion
JOIN "student_archive_records" AS archive
  ON archive."studentId" = completion."studentId"
WHERE completion."thesisId" = thesis."id"
  AND archive."status" = 'ARCHIVED';
