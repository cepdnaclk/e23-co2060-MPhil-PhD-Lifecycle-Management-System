-- Department V1 removes review panels, examiner reviews of routine progress,
-- and the legacy supervisor sign-off fields. This is intentionally destructive
-- and is production-blocked by migration-policy.json pending an approved
-- preservation export and deployment rehearsal.

ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_progressReportReviewId_fkey";
DROP INDEX IF EXISTS "documents_progressReportReviewId_idx";
ALTER TABLE "documents"
  DROP COLUMN IF EXISTS "progressReportReviewId";

DROP TABLE IF EXISTS "progress_report_reviews";
DROP TABLE IF EXISTS "panel_evaluations";
DROP TABLE IF EXISTS "review_panel_student_assignments";
DROP TABLE IF EXISTS "panel_memberships";
DROP TABLE IF EXISTS "review_panels";

ALTER TABLE "progress_reports"
  DROP COLUMN IF EXISTS "isSupervisorSignedOff",
  DROP COLUMN IF EXISTS "supervisorSignedOffAt",
  DROP COLUMN IF EXISTS "supervisorSignedOffById";
