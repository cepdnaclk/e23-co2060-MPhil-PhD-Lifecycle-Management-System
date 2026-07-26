ALTER TYPE "CorrectionOrderStatus"
  ADD VALUE IF NOT EXISTS 'SUPERVISOR_CERTIFIED';

ALTER TYPE "CorrectionOrderStatus"
  ADD VALUE IF NOT EXISTS 'EXAMINER_APPROVED';

ALTER TYPE "ThesisStatus"
  ADD VALUE IF NOT EXISTS 'CORRECTIONS_APPROVED';

CREATE TYPE "CorrectionReviewStage" AS ENUM (
  'SUPERVISOR',
  'EXAMINER'
);

CREATE TYPE "CorrectionReviewDecision" AS ENUM (
  'CERTIFIED',
  'APPROVED',
  'RETURNED'
);

ALTER TABLE "correction_orders"
  ADD COLUMN "originatingThesisVersionId" TEXT,
  ADD COLUMN "requiresExaminerReview" BOOLEAN NOT NULL DEFAULT false;

UPDATE "correction_orders" AS correction_order
SET
  "originatingThesisVersionId" = (
    SELECT thesis_version."id"
    FROM "thesis_versions" AS thesis_version
    WHERE thesis_version."thesisId" = correction_order."thesisId"
    ORDER BY
      thesis_version."isCurrent" DESC,
      thesis_version."versionNumber" DESC
    LIMIT 1
  ),
  "requiresExaminerReview" = (
    correction_order."requirementType" = 'MAJOR'::"CorrectionType"
  );

ALTER TABLE "correction_submissions"
  ADD COLUMN "revisedThesisVersionId" TEXT,
  ADD COLUMN "manifestHash" TEXT;

ALTER TABLE "documents"
  ADD COLUMN "correctionSubmissionId" TEXT;

CREATE TABLE "correction_reviews" (
  "id" TEXT NOT NULL,
  "correctionSubmissionId" TEXT NOT NULL,
  "stage" "CorrectionReviewStage" NOT NULL,
  "decision" "CorrectionReviewDecision" NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "thesisExaminerAssignmentId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "correction_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "correction_orders_originatingThesisVersionId_idx"
  ON "correction_orders"("originatingThesisVersionId");

CREATE UNIQUE INDEX "correction_submissions_revisedThesisVersionId_key"
  ON "correction_submissions"("revisedThesisVersionId");

CREATE INDEX "documents_correctionSubmissionId_idx"
  ON "documents"("correctionSubmissionId");

CREATE UNIQUE INDEX "correction_reviews_submission_stage_reviewer_key"
  ON "correction_reviews"(
    "correctionSubmissionId",
    "stage",
    "reviewerUserId"
  );

CREATE UNIQUE INDEX "correction_reviews_submission_assignment_key"
  ON "correction_reviews"(
    "correctionSubmissionId",
    "thesisExaminerAssignmentId"
  );

CREATE INDEX "correction_reviews_reviewerUserId_createdAt_idx"
  ON "correction_reviews"("reviewerUserId", "createdAt");

ALTER TABLE "correction_orders"
  ADD CONSTRAINT "correction_orders_originatingThesisVersionId_fkey"
  FOREIGN KEY ("originatingThesisVersionId")
  REFERENCES "thesis_versions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "correction_submissions"
  ADD CONSTRAINT "correction_submissions_revisedThesisVersionId_fkey"
  FOREIGN KEY ("revisedThesisVersionId")
  REFERENCES "thesis_versions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "correction_submissions"
  ADD CONSTRAINT "correction_submissions_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_correctionSubmissionId_fkey"
  FOREIGN KEY ("correctionSubmissionId")
  REFERENCES "correction_submissions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "correction_reviews"
  ADD CONSTRAINT "correction_reviews_correctionSubmissionId_fkey"
  FOREIGN KEY ("correctionSubmissionId")
  REFERENCES "correction_submissions"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "correction_reviews"
  ADD CONSTRAINT "correction_reviews_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "correction_reviews"
  ADD CONSTRAINT "correction_reviews_thesisExaminerAssignmentId_fkey"
  FOREIGN KEY ("thesisExaminerAssignmentId")
  REFERENCES "thesis_examiner_assignments"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
