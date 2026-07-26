-- Map preserved legacy ethics records into the Department staged workflow.
-- Legacy approvals and rejections remain at HOD confirmation instead of being
-- treated as final Department decisions without explicit HOD evidence.
UPDATE "ethics_approvals" AS ethics
SET
  "applicability" = 'REQUIRED'::"EthicsApplicability",
  "status" = (
    CASE legacy."legacyStatus"
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'REJECTED' THEN 'REJECTED'
      ELSE 'PENDING'
    END
  )::"EthicsRecordStatus",
  "applicabilityRecordedAt" = COALESCE(
    ethics."applicabilityRecordedAt",
    ethics."createdAt"
  ),
  "statusRecordedBy" = CASE
    WHEN legacy."legacyStatus" IN ('APPROVED', 'REJECTED')
      THEN reviewer."userId"
    ELSE ethics."statusRecordedBy"
  END,
  "statusRecordedAt" = CASE
    WHEN legacy."legacyStatus" IN ('APPROVED', 'REJECTED')
      THEN COALESCE(
        legacy."reviewedAt",
        ethics."statusRecordedAt",
        ethics."updatedAt"
      )
    ELSE ethics."statusRecordedAt"
  END,
  "notes" = COALESCE(ethics."notes", legacy."reviewNotes"),
  "workflowStage" = (
    CASE legacy."legacyStatus"
      WHEN 'SUBMITTED' THEN 'SUPERVISOR_RECOMMENDATION'
      WHEN 'UNDER_REVIEW' THEN 'COORDINATOR_RECORD'
      ELSE 'HOD_CONFIRMATION'
    END
  )::"EthicsWorkflowStage",
  "studentDeclaredAt" = COALESCE(
    ethics."studentDeclaredAt",
    ethics."applicabilityRecordedAt",
    ethics."createdAt"
  ),
  "coordinatorProposedStatus" = CASE
    WHEN legacy."legacyStatus" = 'APPROVED'
      THEN 'APPROVED'::"EthicsRecordStatus"
    WHEN legacy."legacyStatus" = 'REJECTED'
      THEN 'REJECTED'::"EthicsRecordStatus"
    ELSE ethics."coordinatorProposedStatus"
  END,
  "coordinatorRecordedAt" = CASE
    WHEN legacy."legacyStatus" IN ('APPROVED', 'REJECTED')
      THEN COALESCE(
        legacy."reviewedAt",
        ethics."coordinatorRecordedAt",
        ethics."updatedAt"
      )
    ELSE ethics."coordinatorRecordedAt"
  END
FROM "ethics_approval_legacy_states" AS legacy
LEFT JOIN "administrators" AS reviewer
  ON reviewer."id" = legacy."reviewedById"
WHERE legacy."ethicsApprovalId" = ethics."id";

DROP TABLE "ethics_approval_legacy_states";
