CREATE TYPE "EthicsWorkflowStage" AS ENUM (
  'STUDENT_DECLARATION',
  'SUPERVISOR_RECOMMENDATION',
  'COORDINATOR_RECORD',
  'HOD_CONFIRMATION',
  'COMPLETED'
);

CREATE TYPE "EthicsWorkflowAction" AS ENUM (
  'STUDENT_DECLARED_REQUIRED',
  'STUDENT_DECLARED_NOT_REQUIRED',
  'STUDENT_RESUBMITTED',
  'SUPERVISOR_RECOMMENDED',
  'SUPERVISOR_RETURNED',
  'COORDINATOR_RECORDED',
  'COORDINATOR_RETURNED',
  'HOD_CONFIRMED',
  'HOD_RETURNED',
  'HOD_REJECTED'
);

ALTER TABLE "ethics_approvals"
  ADD COLUMN "workflowStage" "EthicsWorkflowStage" NOT NULL DEFAULT 'STUDENT_DECLARATION',
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "coordinatorProposedStatus" "EthicsRecordStatus",
  ADD COLUMN "studentDeclaredAt" TIMESTAMP(3),
  ADD COLUMN "supervisorRecommendedAt" TIMESTAMP(3),
  ADD COLUMN "coordinatorRecordedAt" TIMESTAMP(3),
  ADD COLUMN "hodConfirmedAt" TIMESTAMP(3);

UPDATE "ethics_approvals"
SET
  "studentDeclaredAt" = COALESCE("applicabilityRecordedAt", "createdAt"),
  "workflowStage" = CASE
    WHEN "applicability" = 'UNDETERMINED' THEN 'STUDENT_DECLARATION'::"EthicsWorkflowStage"
    WHEN "status" IN ('APPROVED', 'EXEMPT', 'REJECTED', 'EXPIRED')
      THEN 'HOD_CONFIRMATION'::"EthicsWorkflowStage"
    ELSE 'SUPERVISOR_RECOMMENDATION'::"EthicsWorkflowStage"
  END,
  "coordinatorProposedStatus" = CASE
    WHEN "status" IN ('APPROVED', 'EXEMPT', 'REJECTED', 'EXPIRED')
      THEN "status"
    ELSE NULL
  END,
  "coordinatorRecordedAt" = CASE
    WHEN "status" IN ('APPROVED', 'EXEMPT', 'REJECTED', 'EXPIRED')
      THEN COALESCE("statusRecordedAt", "updatedAt")
    ELSE NULL
  END;

CREATE TABLE "ethics_workflow_decisions" (
  "id" TEXT NOT NULL,
  "ethicsApprovalId" TEXT NOT NULL,
  "stage" "EthicsWorkflowStage" NOT NULL,
  "action" "EthicsWorkflowAction" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ethics_workflow_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ethics_workflow_decisions"
  ADD CONSTRAINT "ethics_workflow_decisions_ethicsApprovalId_fkey"
  FOREIGN KEY ("ethicsApprovalId")
  REFERENCES "ethics_approvals"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ethics_workflow_decisions"
  ADD CONSTRAINT "ethics_workflow_decisions_actorUserId_fkey"
  FOREIGN KEY ("actorUserId")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "ethics_workflow_decisions_ethicsApprovalId_createdAt_idx"
  ON "ethics_workflow_decisions"("ethicsApprovalId", "createdAt");

CREATE INDEX "ethics_workflow_decisions_actorUserId_createdAt_idx"
  ON "ethics_workflow_decisions"("actorUserId", "createdAt");

CREATE UNIQUE INDEX "ethics_approvals_one_active_per_student"
  ON "ethics_approvals"("studentId")
  WHERE "isArchived" = false;
