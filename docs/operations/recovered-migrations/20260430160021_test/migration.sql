-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'SUPERVISOR', 'EXAMINER', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('MPHIL', 'PHD', 'MSC', 'MENG');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'LAPSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ADMITTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ThesisStatus" AS ENUM ('SUBMITTED', 'UNDER_EXAMINATION', 'CORRECTIONS_REQUIRED', 'FINAL_ARCHIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "VivaOutcome" AS ENUM ('PASS', 'MINOR_CORRECTIONS', 'MAJOR_CORRECTIONS', 'FAIL');

-- CreateEnum
CREATE TYPE "AcademicStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'GRADUATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('APPLICATION_ATTACHMENT', 'PROPOSAL', 'THESIS', 'PROGRESS_REPORT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('APPLICATION_STATUS_CHANGED', 'PROPOSAL_STATUS_CHANGED', 'PROGRESS_REPORT_SUBMITTED', 'REGISTRATION_EXPIRY_APPROACHING', 'VIVA_SCHEDULED', 'CORRECTIONS_REQUIRED', 'THESIS_ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('MINOR', 'MAJOR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firebaseUid" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programType" "ProgramType" NOT NULL,
    "academicStatus" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrollmentDate" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "specialization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examiners" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "specialization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examiners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrators" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "applicantPhone" TEXT,
    "researchArea" TEXT,
    "statementOfPurpose" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "programType" "ProgramType" NOT NULL,
    "studentId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_proposals" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_forms" (
    "id" TEXT NOT NULL,
    "researchProposalId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_assignments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "supervisorUserId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_reports" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "isSupervisorSignedOff" BOOLEAN NOT NULL DEFAULT false,
    "supervisorSignedOffAt" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_panels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_memberships" (
    "id" TEXT NOT NULL,
    "reviewPanelId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_evaluations" (
    "id" TEXT NOT NULL,
    "reviewPanelId" TEXT NOT NULL,
    "progressReportId" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theses" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "status" "ThesisStatus" NOT NULL DEFAULT 'SUBMITTED',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thesis_examiner_assignments" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examinerId" TEXT NOT NULL,
    "examinerUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thesis_examiner_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vivas" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "outcome" "VivaOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vivas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_documents" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "correctionType" "CorrectionType" NOT NULL,
    "description" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correction_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "applicationId" TEXT,
    "studentId" TEXT,
    "researchProposalId" TEXT,
    "progressReportId" TEXT,
    "thesisId" TEXT,
    "correctionDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "studentId" TEXT,
    "event" "NotificationEvent" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "subject" TEXT NOT NULL,
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE INDEX "students_academicStatus_idx" ON "students"("academicStatus");

-- CreateIndex
CREATE UNIQUE INDEX "supervisors_userId_key" ON "supervisors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "examiners_userId_key" ON "examiners"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "administrators_userId_key" ON "administrators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_studentId_key" ON "applications"("studentId");

-- CreateIndex
CREATE INDEX "applications_applicantEmail_idx" ON "applications"("applicantEmail");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "registrations_studentId_status_idx" ON "registrations"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "research_proposals_applicationId_key" ON "research_proposals"("applicationId");

-- CreateIndex
CREATE INDEX "research_proposals_studentId_status_idx" ON "research_proposals"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_forms_researchProposalId_supervisorId_key" ON "evaluation_forms"("researchProposalId", "supervisorId");

-- CreateIndex
CREATE INDEX "supervisor_assignments_supervisorId_idx" ON "supervisor_assignments"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_assignments_studentId_supervisorId_key" ON "supervisor_assignments"("studentId", "supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_assignments_studentId_supervisorUserId_key" ON "supervisor_assignments"("studentId", "supervisorUserId");

-- CreateIndex
CREATE INDEX "progress_reports_studentId_isOverdue_idx" ON "progress_reports"("studentId", "isOverdue");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_studentId_periodLabel_key" ON "progress_reports"("studentId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "panel_memberships_reviewPanelId_supervisorId_key" ON "panel_memberships"("reviewPanelId", "supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "panel_evaluations_reviewPanelId_progressReportId_key" ON "panel_evaluations"("reviewPanelId", "progressReportId");

-- CreateIndex
CREATE INDEX "theses_studentId_status_idx" ON "theses"("studentId", "status");

-- CreateIndex
CREATE INDEX "thesis_examiner_assignments_studentId_examinerId_idx" ON "thesis_examiner_assignments"("studentId", "examinerId");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_examiner_assignments_thesisId_examinerId_key" ON "thesis_examiner_assignments"("thesisId", "examinerId");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_examiner_assignments_studentId_examinerUserId_key" ON "thesis_examiner_assignments"("studentId", "examinerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "vivas_thesisId_key" ON "vivas"("thesisId");

-- CreateIndex
CREATE INDEX "correction_documents_thesisId_isApproved_idx" ON "correction_documents"("thesisId", "isApproved");

-- CreateIndex
CREATE INDEX "documents_documentType_isDeleted_idx" ON "documents"("documentType", "isDeleted");

-- CreateIndex
CREATE INDEX "documents_researchProposalId_version_idx" ON "documents"("researchProposalId", "version");

-- CreateIndex
CREATE INDEX "documents_thesisId_version_idx" ON "documents"("thesisId", "version");

-- CreateIndex
CREATE INDEX "notifications_recipientId_isRead_idx" ON "notifications"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "notification_logs_recipientId_deliveryStatus_idx" ON "notification_logs"("recipientId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "notification_logs_event_createdAt_idx" ON "notification_logs"("event", "createdAt");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisors" ADD CONSTRAINT "supervisors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examiners" ADD CONSTRAINT "examiners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrators" ADD CONSTRAINT "administrators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_proposals" ADD CONSTRAINT "research_proposals_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_proposals" ADD CONSTRAINT "research_proposals_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_forms" ADD CONSTRAINT "evaluation_forms_researchProposalId_fkey" FOREIGN KEY ("researchProposalId") REFERENCES "research_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_forms" ADD CONSTRAINT "evaluation_forms_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_memberships" ADD CONSTRAINT "panel_memberships_reviewPanelId_fkey" FOREIGN KEY ("reviewPanelId") REFERENCES "review_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_memberships" ADD CONSTRAINT "panel_memberships_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_evaluations" ADD CONSTRAINT "panel_evaluations_reviewPanelId_fkey" FOREIGN KEY ("reviewPanelId") REFERENCES "review_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_evaluations" ADD CONSTRAINT "panel_evaluations_progressReportId_fkey" FOREIGN KEY ("progressReportId") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theses" ADD CONSTRAINT "theses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_examiner_assignments" ADD CONSTRAINT "thesis_examiner_assignments_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_examiner_assignments" ADD CONSTRAINT "thesis_examiner_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_examiner_assignments" ADD CONSTRAINT "thesis_examiner_assignments_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "examiners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vivas" ADD CONSTRAINT "vivas_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_documents" ADD CONSTRAINT "correction_documents_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_documents" ADD CONSTRAINT "correction_documents_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_researchProposalId_fkey" FOREIGN KEY ("researchProposalId") REFERENCES "research_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_progressReportId_fkey" FOREIGN KEY ("progressReportId") REFERENCES "progress_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_correctionDocumentId_fkey" FOREIGN KEY ("correctionDocumentId") REFERENCES "correction_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
