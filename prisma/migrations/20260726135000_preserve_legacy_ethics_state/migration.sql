-- Preserve legacy ethics-review state before Department V1 introduces its
-- replacement status and staged workflow columns. The archive table is
-- deliberately temporary and is removed by the paired reconciliation
-- migration after the new workflow schema exists.
CREATE TABLE "ethics_approval_legacy_states" (
  "ethicsApprovalId" TEXT NOT NULL,
  "legacyStatus" TEXT NOT NULL,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,

  CONSTRAINT "ethics_approval_legacy_states_pkey"
    PRIMARY KEY ("ethicsApprovalId")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ethics_approvals'
      AND column_name = 'status'
      AND udt_name = 'EthicsApprovalStatus'
  ) THEN
    INSERT INTO "ethics_approval_legacy_states" (
      "ethicsApprovalId",
      "legacyStatus",
      "reviewNotes",
      "reviewedAt",
      "reviewedById"
    )
    SELECT
      "id",
      "status"::text,
      "reviewNotes",
      "reviewedAt",
      "reviewedById"
    FROM "ethics_approvals";

    ALTER TABLE "ethics_approvals"
      DROP CONSTRAINT IF EXISTS "ethics_approvals_reviewedById_fkey";
    DROP INDEX IF EXISTS "ethics_approvals_studentId_status_idx";
    DROP INDEX IF EXISTS "ethics_approvals_status_createdAt_idx";

    ALTER TABLE "ethics_approvals"
      DROP COLUMN "status",
      DROP COLUMN "reviewNotes",
      DROP COLUMN "reviewedAt",
      DROP COLUMN "reviewedById";

    DROP TYPE "EthicsApprovalStatus";
  END IF;
END $$;
