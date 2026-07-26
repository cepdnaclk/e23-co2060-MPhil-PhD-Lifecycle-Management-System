-- Add the database relation already represented by Viva.programmeCompletion.
ALTER TABLE "vivas"
  ADD COLUMN "programmeCompletionId" TEXT;

ALTER TABLE "vivas"
  ADD CONSTRAINT "vivas_programmeCompletionId_fkey"
  FOREIGN KEY ("programmeCompletionId")
  REFERENCES "programme_completions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- PostgreSQL truncates identifiers to 63 bytes. Normalize the long names to
-- the identifiers Prisma derives so the migration history and schema agree.
ALTER INDEX "applications_proposedSupervisorUserId_supervisorConsentStatus_i"
  RENAME TO "applications_proposedSupervisorUserId_supervisorConsentStat_idx";

ALTER INDEX "proposal_reviewer_assignments_proposalVersionId_reviewerUserId_"
  RENAME TO "proposal_reviewer_assignments_proposalVersionId_reviewerUse_key";

ALTER INDEX "proposal_reviewer_assignments_reviewerUserId_status_assignedAt_"
  RENAME TO "proposal_reviewer_assignments_reviewerUserId_status_assigne_idx";

ALTER INDEX "thesis_readiness_certifications_hodApprovedByUserId_hodApproved"
  RENAME TO "thesis_readiness_certifications_hodApprovedByUserId_hodAppr_idx";
