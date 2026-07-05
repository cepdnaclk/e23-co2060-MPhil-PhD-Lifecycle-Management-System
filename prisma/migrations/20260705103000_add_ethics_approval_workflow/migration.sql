CREATE TYPE "EthicsApprovalStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

ALTER TYPE "DocumentType" ADD VALUE 'ETHICS_APPROVAL';

ALTER TYPE "NotificationEvent" ADD VALUE 'ETHICS_APPROVAL_SUBMITTED';
ALTER TYPE "NotificationEvent" ADD VALUE 'ETHICS_APPROVAL_STATUS_CHANGED';

CREATE TABLE "ethics_approvals" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "EthicsApprovalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ethics_approvals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "documents" ADD COLUMN "ethicsApprovalId" TEXT;

CREATE INDEX "ethics_approvals_studentId_status_idx" ON "ethics_approvals"("studentId", "status");
CREATE INDEX "ethics_approvals_status_createdAt_idx" ON "ethics_approvals"("status", "createdAt");
CREATE INDEX "documents_ethicsApprovalId_idx" ON "documents"("ethicsApprovalId");

ALTER TABLE "ethics_approvals" ADD CONSTRAINT "ethics_approvals_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ethics_approvals" ADD CONSTRAINT "ethics_approvals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_ethicsApprovalId_fkey" FOREIGN KEY ("ethicsApprovalId") REFERENCES "ethics_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
