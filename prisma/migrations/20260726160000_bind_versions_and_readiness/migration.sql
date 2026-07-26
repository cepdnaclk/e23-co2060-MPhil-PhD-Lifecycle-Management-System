-- Bind Department V1 version evidence and readiness gates. This migration binds
-- application-proposal and progress evidence to exact versions, adds a scoped
-- applicant revision capability, and moves thesis readiness ahead of thesis
-- submission with separate Student, Supervisor, and HOD decisions.

ALTER TYPE "ReadinessDecision" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "ReadinessDecision" ADD VALUE IF NOT EXISTS 'HOD_APPROVED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'THESIS_STATUS_CHANGED';

ALTER TABLE "applications"
  ADD COLUMN "revisionCapabilityTokenHash" TEXT,
  ADD COLUMN "revisionCapabilityExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "applications_revisionCapabilityTokenHash_key"
  ON "applications"("revisionCapabilityTokenHash");

ALTER TABLE "documents"
  ADD COLUMN "applicationProposalVersionId" TEXT,
  ADD COLUMN "progressReportVersionId" TEXT;

-- Existing application evidence belongs to the application proposal version
-- that was current when Department V1 was introduced.
UPDATE "documents" AS d
SET "applicationProposalVersionId" = v."id"
FROM "application_proposal_versions" AS v
WHERE d."applicationId" = v."applicationId"
  AND v."isCurrent" = true
  AND d."applicationProposalVersionId" IS NULL;

-- Bind any already-versioned progress evidence to its report's current version.
UPDATE "documents" AS d
SET "progressReportVersionId" = v."id"
FROM "progress_report_versions" AS v
JOIN "progress_reports" AS r ON r."id" = v."progressReportId"
WHERE d."progressReportId" = r."id"
  AND v."versionNumber" = r."currentVersion"
  AND d."progressReportVersionId" IS NULL;

CREATE INDEX "documents_applicationProposalVersionId_idx"
  ON "documents"("applicationProposalVersionId");
CREATE INDEX "documents_progressReportVersionId_idx"
  ON "documents"("progressReportVersionId");
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_applicationProposalVersionId_fkey"
  FOREIGN KEY ("applicationProposalVersionId")
  REFERENCES "application_proposal_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "documents_progressReportVersionId_fkey"
  FOREIGN KEY ("progressReportVersionId")
  REFERENCES "progress_report_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "thesis_readiness_certifications"
    GROUP BY "studentId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple thesis-readiness rows exist for one Student; reconcile them before Department V1 readiness migration';
  END IF;
END $$;

ALTER TABLE "thesis_readiness_certifications"
  ADD COLUMN "studentMessage" TEXT,
  ADD COLUMN "supervisorNotes" TEXT,
  ADD COLUMN "certifiedAt" TIMESTAMP(3),
  ADD COLUMN "hodApprovedByUserId" TEXT,
  ADD COLUMN "hodNotes" TEXT,
  ADD COLUMN "hodApprovedAt" TIMESTAMP(3);

UPDATE "thesis_readiness_certifications"
SET
  "supervisorNotes" = "comments",
  "certifiedAt" = CASE
    WHEN "decision" = 'CERTIFIED' THEN "decidedAt"
    ELSE NULL
  END;

ALTER TABLE "thesis_readiness_certifications"
  ALTER COLUMN "thesisId" DROP NOT NULL,
  ALTER COLUMN "certifiedByUserId" DROP NOT NULL,
  ALTER COLUMN "checklist" DROP NOT NULL,
  DROP COLUMN "comments";

CREATE UNIQUE INDEX "thesis_readiness_certifications_studentId_key"
  ON "thesis_readiness_certifications"("studentId");
CREATE INDEX "thesis_readiness_certifications_hodApprovedByUserId_hodApprovedAt_idx"
  ON "thesis_readiness_certifications"("hodApprovedByUserId", "hodApprovedAt");
ALTER TABLE "thesis_readiness_certifications"
  DROP CONSTRAINT "thesis_readiness_certifications_thesisId_fkey",
  ADD CONSTRAINT "thesis_readiness_certifications_thesisId_fkey"
  FOREIGN KEY ("thesisId") REFERENCES "theses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  DROP CONSTRAINT "thesis_readiness_certifications_certifiedByUserId_fkey",
  ADD CONSTRAINT "thesis_readiness_certifications_certifiedByUserId_fkey"
  FOREIGN KEY ("certifiedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "thesis_readiness_certifications_hodApprovedByUserId_fkey"
  FOREIGN KEY ("hodApprovedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
