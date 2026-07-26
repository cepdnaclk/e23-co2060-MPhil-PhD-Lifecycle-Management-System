-- Normalize the long CorrectionReview index names to the identifiers Prisma
-- derives after PostgreSQL's 63-byte identifier truncation.
ALTER INDEX "correction_reviews_submission_assignment_key"
  RENAME TO "correction_reviews_correctionSubmissionId_thesisExaminerAss_key";

ALTER INDEX "correction_reviews_submission_stage_reviewer_key"
  RENAME TO "correction_reviews_correctionSubmissionId_stage_reviewerUse_key";
