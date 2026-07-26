-- Department PGLMS V1 core domain.
-- This migration intentionally fails if legacy MSc/MEng records remain. A
-- populated deployment must classify or remove them through an approved data
-- migration before the enum can be narrowed.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HOD';

CREATE TYPE "StudyMode" AS ENUM ('FULL_TIME', 'PART_TIME');
CREATE TYPE "SupervisorConsentStatus" AS ENUM ('PENDING', 'CONSENTED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE "DepartmentDecision" AS ENUM ('PENDING', 'APPROVED', 'REVISION_REQUIRED', 'REJECTED');
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MilestoneStatus" AS ENUM ('SCHEDULED', 'DUE', 'SUBMITTED', 'RETURNED', 'APPROVED', 'OVERDUE', 'WAIVED');
CREATE TYPE "ProgressSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');
CREATE TYPE "EthicsApplicability" AS ENUM ('UNDETERMINED', 'REQUIRED', 'NOT_REQUIRED');
CREATE TYPE "EthicsRecordStatus" AS ENUM ('NOT_RECORDED', 'PENDING', 'APPROVED', 'EXEMPT', 'REJECTED', 'EXPIRED');
CREATE TYPE "ReadinessDecision" AS ENUM ('PENDING', 'CERTIFIED', 'RETURNED', 'REVOKED');
CREATE TYPE "ExaminerRecommendation" AS ENUM ('PASS', 'MINOR_CORRECTIONS', 'MAJOR_CORRECTIONS', 'RESUBMIT', 'FAIL');
CREATE TYPE "CorrectionOrderStatus" AS ENUM ('ORDERED', 'SUBMITTED', 'RETURNED', 'COMPLETION_APPROVED');
CREATE TYPE "CompletionStatus" AS ENUM ('PENDING', 'HOD_APPROVED', 'ADMIN_RECORDED');
CREATE TYPE "GraduationStatus" AS ENUM ('NOT_RECORDED', 'GRADUATED');
CREATE TYPE "ArchiveStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "students"
    WHERE "programType"::text IN ('MSC', 'MENG')
  ) OR EXISTS (
    SELECT 1 FROM "applications"
    WHERE "programType"::text IN ('MSC', 'MENG')
  ) OR EXISTS (
    SELECT 1 FROM "review_panels"
    WHERE "cohortProgramType"::text IN ('MSC', 'MENG')
  ) THEN
    RAISE EXCEPTION 'Department V1 supports only MPHIL and PHD; migrate legacy MSc/MEng rows first';
  END IF;
END $$;

ALTER TYPE "ProgramType" RENAME TO "ProgramType_legacy";
CREATE TYPE "ProgramType" AS ENUM ('MPHIL', 'PHD');
ALTER TABLE "students"
  ALTER COLUMN "programType" TYPE "ProgramType"
  USING ("programType"::text::"ProgramType");
ALTER TABLE "applications"
  ALTER COLUMN "programType" TYPE "ProgramType"
  USING ("programType"::text::"ProgramType");
ALTER TABLE "review_panels"
  ALTER COLUMN "cohortProgramType" TYPE "ProgramType"
  USING ("cohortProgramType"::text::"ProgramType");
DROP TYPE "ProgramType_legacy";

ALTER TABLE "students"
  ADD COLUMN "studyMode" "StudyMode" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN "expectedCompletionDate" TIMESTAMP(3);

ALTER TABLE "applications"
  ADD COLUMN "studyMode" "StudyMode" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN "proposalTitle" TEXT,
  ADD COLUMN "proposalAbstract" TEXT,
  ADD COLUMN "proposedSupervisorId" TEXT,
  ADD COLUMN "proposedSupervisorUserId" TEXT,
  ADD COLUMN "supervisorConsentStatus" "SupervisorConsentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "supervisorConsentRecordedAt" TIMESTAMP(3),
  ADD COLUMN "departmentDecision" "DepartmentDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "hodDecisionByUserId" TEXT,
  ADD COLUMN "hodDecisionAt" TIMESTAMP(3),
  ADD COLUMN "hodDecisionReason" TEXT;

ALTER TABLE "registrations"
  ADD COLUMN "studyMode" "StudyMode" NOT NULL DEFAULT 'FULL_TIME',
  ADD COLUMN "durationMonths" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "isFixedTerm" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "supervisor_assignments"
  ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "endReason" TEXT;
DROP INDEX "supervisor_assignments_studentId_supervisorId_key";
DROP INDEX "supervisor_assignments_studentId_supervisorUserId_key";

ALTER TABLE "ethics_approvals"
  ADD COLUMN "applicability" "EthicsApplicability" NOT NULL DEFAULT 'UNDETERMINED',
  ADD COLUMN "status" "EthicsRecordStatus" NOT NULL DEFAULT 'NOT_RECORDED',
  ADD COLUMN "applicabilityRecordedBy" TEXT,
  ADD COLUMN "applicabilityRecordedAt" TIMESTAMP(3),
  ADD COLUMN "statusRecordedBy" TEXT,
  ADD COLUMN "statusRecordedAt" TIMESTAMP(3),
  ADD COLUMN "referenceNumber" TEXT,
  ADD COLUMN "validUntil" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT;

ALTER TABLE "progress_reports"
  ADD COLUMN "milestoneId" TEXT,
  ADD COLUMN "status" "ProgressSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "returnedAt" TIMESTAMP(3),
  ADD COLUMN "returnedByUserId" TEXT,
  ADD COLUMN "returnReason" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT;

ALTER TABLE "thesis_examiner_assignments"
  ADD COLUMN "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "confirmedByHodUserId" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);

ALTER TABLE "vivas"
  ADD COLUMN "hodOutcome" "ExaminerRecommendation",
  ADD COLUMN "hodDecisionByUserId" TEXT,
  ADD COLUMN "hodDecisionAt" TIMESTAMP(3),
  ADD COLUMN "hodDecisionReason" TEXT;

CREATE TABLE "hods" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "department" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_proposal_versions" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "abstract" TEXT NOT NULL,
  "changeSummary" TEXT,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "application_proposal_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proposal_reviewer_assignments" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "proposalVersionId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "proposal_reviewer_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proposal_reviews" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "proposalVersionId" TEXT NOT NULL,
  "decision" "DepartmentDecision" NOT NULL,
  "comments" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proposal_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admission_executions" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "executedByUserId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admission_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "programme_rules" (
  "id" TEXT NOT NULL,
  "programType" "ProgramType" NOT NULL,
  "studyMode" "StudyMode" NOT NULL,
  "durationMonths" INTEGER NOT NULL,
  "milestoneIntervalMonths" INTEGER NOT NULL DEFAULT 6,
  "milestoneCount" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "programme_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "programme_rules_positive_values" CHECK (
    "durationMonths" > 0 AND
    "milestoneIntervalMonths" = 6 AND
    "milestoneCount" > 0
  )
);

CREATE TABLE "student_milestones" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "MilestoneStatus" NOT NULL DEFAULT 'SCHEDULED',
  "openedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_milestones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_milestones_positive_sequence" CHECK ("sequenceNumber" > 0)
);

CREATE TABLE "progress_report_versions" (
  "id" TEXT NOT NULL,
  "progressReportId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "narrative" TEXT NOT NULL,
  "changeSummary" TEXT,
  "submittedByUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "progress_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thesis_readiness_certifications" (
  "id" TEXT NOT NULL,
  "thesisId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "certifiedByUserId" TEXT NOT NULL,
  "decision" "ReadinessDecision" NOT NULL DEFAULT 'PENDING',
  "checklist" JSONB NOT NULL,
  "comments" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "thesis_readiness_certifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thesis_examiner_reports" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "recommendation" "ExaminerRecommendation" NOT NULL,
  "reportText" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "thesis_examiner_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "viva_recommendations" (
  "id" TEXT NOT NULL,
  "vivaId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "recommendation" "ExaminerRecommendation" NOT NULL,
  "rationale" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "viva_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "correction_orders" (
  "id" TEXT NOT NULL,
  "vivaId" TEXT NOT NULL,
  "thesisId" TEXT NOT NULL,
  "orderedByHodUserId" TEXT NOT NULL,
  "requirementType" "CorrectionType" NOT NULL,
  "requirements" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" "CorrectionOrderStatus" NOT NULL DEFAULT 'ORDERED',
  "completionApprovedBy" TEXT,
  "completionApprovedAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "correction_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "correction_submissions" (
  "id" TEXT NOT NULL,
  "correctionOrderId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "responseSummary" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  "returnReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "correction_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "programme_completions" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "thesisId" TEXT NOT NULL,
  "status" "CompletionStatus" NOT NULL DEFAULT 'PENDING',
  "approvedByHodUserId" TEXT,
  "hodApprovedAt" TIMESTAMP(3),
  "hodComments" TEXT,
  "recordedByAdminUserId" TEXT,
  "adminRecordedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "programme_completions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "graduation_records" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "GraduationStatus" NOT NULL DEFAULT 'NOT_RECORDED',
  "graduationDate" TIMESTAMP(3),
  "recordedByUserId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "graduation_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_archive_records" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "ArchiveStatus" NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_archive_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hods_userId_key" ON "hods"("userId");
CREATE UNIQUE INDEX "application_proposal_versions_applicationId_versionNumber_key" ON "application_proposal_versions"("applicationId", "versionNumber");
CREATE INDEX "application_proposal_versions_applicationId_isCurrent_idx" ON "application_proposal_versions"("applicationId", "isCurrent");
CREATE UNIQUE INDEX "proposal_reviewer_assignments_proposalVersionId_reviewerUserId_key" ON "proposal_reviewer_assignments"("proposalVersionId", "reviewerUserId");
CREATE INDEX "proposal_reviewer_assignments_reviewerUserId_status_assignedAt_idx" ON "proposal_reviewer_assignments"("reviewerUserId", "status", "assignedAt");
CREATE INDEX "proposal_reviewer_assignments_applicationId_status_idx" ON "proposal_reviewer_assignments"("applicationId", "status");
CREATE UNIQUE INDEX "proposal_reviews_assignmentId_key" ON "proposal_reviews"("assignmentId");
CREATE INDEX "proposal_reviews_proposalVersionId_submittedAt_idx" ON "proposal_reviews"("proposalVersionId", "submittedAt");
CREATE UNIQUE INDEX "admission_executions_applicationId_key" ON "admission_executions"("applicationId");
CREATE UNIQUE INDEX "admission_executions_studentId_key" ON "admission_executions"("studentId");
CREATE UNIQUE INDEX "admission_executions_registrationId_key" ON "admission_executions"("registrationId");
CREATE INDEX "admission_executions_executedByUserId_executedAt_idx" ON "admission_executions"("executedByUserId", "executedAt");
CREATE UNIQUE INDEX "programme_rules_programType_studyMode_key" ON "programme_rules"("programType", "studyMode");
CREATE UNIQUE INDEX "student_milestones_studentId_sequenceNumber_key" ON "student_milestones"("studentId", "sequenceNumber");
CREATE INDEX "student_milestones_status_dueDate_idx" ON "student_milestones"("status", "dueDate");
CREATE UNIQUE INDEX "progress_reports_milestoneId_key" ON "progress_reports"("milestoneId");
CREATE UNIQUE INDEX "progress_report_versions_progressReportId_versionNumber_key" ON "progress_report_versions"("progressReportId", "versionNumber");
CREATE INDEX "progress_report_versions_submittedByUserId_submittedAt_idx" ON "progress_report_versions"("submittedByUserId", "submittedAt");
CREATE UNIQUE INDEX "thesis_readiness_certifications_thesisId_key" ON "thesis_readiness_certifications"("thesisId");
CREATE INDEX "thesis_readiness_certifications_studentId_decision_idx" ON "thesis_readiness_certifications"("studentId", "decision");
CREATE INDEX "thesis_readiness_certifications_certifiedByUserId_createdAt_idx" ON "thesis_readiness_certifications"("certifiedByUserId", "createdAt");
CREATE UNIQUE INDEX "thesis_examiner_reports_assignmentId_key" ON "thesis_examiner_reports"("assignmentId");
CREATE INDEX "thesis_examiner_reports_authorUserId_submittedAt_idx" ON "thesis_examiner_reports"("authorUserId", "submittedAt");
CREATE UNIQUE INDEX "viva_recommendations_assignmentId_key" ON "viva_recommendations"("assignmentId");
CREATE INDEX "viva_recommendations_vivaId_submittedAt_idx" ON "viva_recommendations"("vivaId", "submittedAt");
CREATE INDEX "viva_recommendations_authorUserId_submittedAt_idx" ON "viva_recommendations"("authorUserId", "submittedAt");
CREATE INDEX "correction_orders_thesisId_status_idx" ON "correction_orders"("thesisId", "status");
CREATE INDEX "correction_orders_orderedByHodUserId_createdAt_idx" ON "correction_orders"("orderedByHodUserId", "createdAt");
CREATE UNIQUE INDEX "correction_submissions_correctionOrderId_versionNumber_key" ON "correction_submissions"("correctionOrderId", "versionNumber");
CREATE INDEX "correction_submissions_submittedByUserId_submittedAt_idx" ON "correction_submissions"("submittedByUserId", "submittedAt");
CREATE UNIQUE INDEX "programme_completions_studentId_key" ON "programme_completions"("studentId");
CREATE UNIQUE INDEX "programme_completions_thesisId_key" ON "programme_completions"("thesisId");
CREATE INDEX "programme_completions_status_createdAt_idx" ON "programme_completions"("status", "createdAt");
CREATE UNIQUE INDEX "graduation_records_studentId_key" ON "graduation_records"("studentId");
CREATE INDEX "graduation_records_status_graduationDate_idx" ON "graduation_records"("status", "graduationDate");
CREATE UNIQUE INDEX "student_archive_records_studentId_key" ON "student_archive_records"("studentId");
CREATE INDEX "student_archive_records_status_archivedAt_idx" ON "student_archive_records"("status", "archivedAt");
CREATE INDEX "applications_departmentDecision_createdAt_idx" ON "applications"("departmentDecision", "createdAt");
CREATE INDEX "applications_proposedSupervisorUserId_supervisorConsentStatus_idx" ON "applications"("proposedSupervisorUserId", "supervisorConsentStatus");
CREATE INDEX "supervisor_assignments_studentId_effectiveFrom_effectiveTo_idx" ON "supervisor_assignments"("studentId", "effectiveFrom", "effectiveTo");
CREATE INDEX "ethics_approvals_applicability_status_idx" ON "ethics_approvals"("applicability", "status");
CREATE INDEX "thesis_examiner_assignments_status_confirmedAt_idx" ON "thesis_examiner_assignments"("status", "confirmedAt");

ALTER TABLE "hods" ADD CONSTRAINT "hods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_proposedSupervisorId_fkey" FOREIGN KEY ("proposedSupervisorId") REFERENCES "supervisors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_proposedSupervisorUserId_fkey" FOREIGN KEY ("proposedSupervisorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_hodDecisionByUserId_fkey" FOREIGN KEY ("hodDecisionByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_proposal_versions" ADD CONSTRAINT "application_proposal_versions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_reviewer_assignments" ADD CONSTRAINT "proposal_reviewer_assignments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_reviewer_assignments" ADD CONSTRAINT "proposal_reviewer_assignments_proposalVersionId_fkey" FOREIGN KEY ("proposalVersionId") REFERENCES "application_proposal_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_reviewer_assignments" ADD CONSTRAINT "proposal_reviewer_assignments_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "proposal_reviews_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "proposal_reviewer_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "proposal_reviews_proposalVersionId_fkey" FOREIGN KEY ("proposalVersionId") REFERENCES "application_proposal_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_executions" ADD CONSTRAINT "admission_executions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_executions" ADD CONSTRAINT "admission_executions_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_executions" ADD CONSTRAINT "admission_executions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admission_executions" ADD CONSTRAINT "admission_executions_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_milestones" ADD CONSTRAINT "student_milestones_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "student_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "progress_report_versions" ADD CONSTRAINT "progress_report_versions_progressReportId_fkey" FOREIGN KEY ("progressReportId") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "thesis_readiness_certifications" ADD CONSTRAINT "thesis_readiness_certifications_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "thesis_readiness_certifications" ADD CONSTRAINT "thesis_readiness_certifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "thesis_readiness_certifications" ADD CONSTRAINT "thesis_readiness_certifications_certifiedByUserId_fkey" FOREIGN KEY ("certifiedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "thesis_examiner_assignments" ADD CONSTRAINT "thesis_examiner_assignments_confirmedByHodUserId_fkey" FOREIGN KEY ("confirmedByHodUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "thesis_examiner_reports" ADD CONSTRAINT "thesis_examiner_reports_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "thesis_examiner_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "thesis_examiner_reports" ADD CONSTRAINT "thesis_examiner_reports_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vivas" ADD CONSTRAINT "vivas_hodDecisionByUserId_fkey" FOREIGN KEY ("hodDecisionByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "viva_recommendations" ADD CONSTRAINT "viva_recommendations_vivaId_fkey" FOREIGN KEY ("vivaId") REFERENCES "vivas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "viva_recommendations" ADD CONSTRAINT "viva_recommendations_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "thesis_examiner_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "viva_recommendations" ADD CONSTRAINT "viva_recommendations_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "correction_orders" ADD CONSTRAINT "correction_orders_vivaId_fkey" FOREIGN KEY ("vivaId") REFERENCES "vivas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "correction_orders" ADD CONSTRAINT "correction_orders_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "correction_orders" ADD CONSTRAINT "correction_orders_orderedByHodUserId_fkey" FOREIGN KEY ("orderedByHodUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "correction_orders" ADD CONSTRAINT "correction_orders_completionApprovedBy_fkey" FOREIGN KEY ("completionApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "correction_submissions" ADD CONSTRAINT "correction_submissions_correctionOrderId_fkey" FOREIGN KEY ("correctionOrderId") REFERENCES "correction_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "programme_completions" ADD CONSTRAINT "programme_completions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_completions" ADD CONSTRAINT "programme_completions_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programme_completions" ADD CONSTRAINT "programme_completions_approvedByHodUserId_fkey" FOREIGN KEY ("approvedByHodUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "programme_completions" ADD CONSTRAINT "programme_completions_recordedByAdminUserId_fkey" FOREIGN KEY ("recordedByAdminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_archive_records" ADD CONSTRAINT "student_archive_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_archive_records" ADD CONSTRAINT "student_archive_records_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "programme_rules" (
  "id", "programType", "studyMode", "durationMonths",
  "milestoneIntervalMonths", "milestoneCount", "updatedAt"
) VALUES
  ('programme-rule-mphil-ft', 'MPHIL', 'FULL_TIME', 24, 6, 4, CURRENT_TIMESTAMP),
  ('programme-rule-mphil-pt', 'MPHIL', 'PART_TIME', 36, 6, 6, CURRENT_TIMESTAMP),
  ('programme-rule-phd-ft', 'PHD', 'FULL_TIME', 36, 6, 6, CURRENT_TIMESTAMP),
  ('programme-rule-phd-pt', 'PHD', 'PART_TIME', 54, 6, 9, CURRENT_TIMESTAMP);
