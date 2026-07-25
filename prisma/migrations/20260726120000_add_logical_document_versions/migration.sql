CREATE TYPE "UploadPurpose" AS ENUM (
    'APPLICATION',
    'PROPOSAL',
    'ETHICS_APPROVAL',
    'PROGRESS_REPORT',
    'THESIS',
    'CORRECTION',
    'REVIEW_ATTACHMENT'
);

CREATE TYPE "UploadSessionStatus" AS ENUM (
    'OPEN',
    'FINALIZING',
    'FINALIZED',
    'ABORTED',
    'EXPIRED',
    'FAILED'
);

CREATE TYPE "UploadFileStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('LEGACY', 'VERIFIED');
CREATE TYPE "DocumentAccessAction" AS ENUM ('LIST', 'DOWNLOAD');
CREATE TYPE "DocumentAccessDecision" AS ENUM ('ALLOWED', 'DENIED');

ALTER TABLE "documents"
    ADD COLUMN "sizeBytes" INTEGER,
    ADD COLUMN "checksumSha256" TEXT,
    ADD COLUMN "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN "verifiedAt" TIMESTAMP(3),
    ADD COLUMN "proposalVersionId" TEXT,
    ADD COLUMN "thesisVersionId" TEXT;

ALTER TABLE "evaluation_forms"
    ADD COLUMN "proposalVersionId" TEXT,
    ADD COLUMN "evidenceManifestHash" TEXT;

ALTER TABLE "progress_report_reviews"
    ADD COLUMN "evidenceManifestHash" TEXT;

ALTER TABLE "thesis_examiner_assignments"
    ADD COLUMN "thesisVersionId" TEXT,
    ADD COLUMN "evidenceManifestHash" TEXT;

CREATE TABLE "proposal_versions" (
    "id" TEXT NOT NULL,
    "researchProposalId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "manifestHash" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thesis_versions" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "manifestHash" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "thesis_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "capabilityTokenHash" TEXT,
    "purpose" "UploadPurpose" NOT NULL,
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedEntityId" TEXT,
    "result" JSONB,
    "abortedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "lastRequestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staged_upload_files" (
    "id" TEXT NOT NULL,
    "uploadSessionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "expectedMimeType" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "expectedSha256" TEXT,
    "storagePath" TEXT NOT NULL,
    "actualMimeType" TEXT,
    "actualSizeBytes" INTEGER,
    "actualSha256" TEXT,
    "status" "UploadFileStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staged_upload_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_access_events" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" "DocumentAccessAction" NOT NULL,
    "decision" "DocumentAccessDecision" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "storagePathHash" TEXT NOT NULL,
    "signedUrlExpiresAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_access_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_migration_issues" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_migration_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_request_rate_limits" (
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "public_request_rate_limits_pkey" PRIMARY KEY ("keyHash")
);

INSERT INTO "document_migration_issues" (
    "id",
    "entityType",
    "entityId",
    "reason",
    "details"
)
SELECT
    'legacy-proposal-issue-' || md5(p."id"),
    'RESEARCH_PROPOSAL',
    p."id",
    'LEGACY_CURRENT_VERSION_AMBIGUOUS',
    jsonb_build_object(
        'declaredCurrentVersion', p."currentVersion",
        'currentDocumentVersions',
        COALESCE(
            (
                SELECT jsonb_agg(DISTINCT d."version")
                FROM "documents" d
                WHERE d."researchProposalId" = p."id"
                  AND d."isDeleted" = false
                  AND d."isCurrentVersion" = true
            ),
            '[]'::jsonb
        )
    )
FROM "research_proposals" p
WHERE NOT EXISTS (
        SELECT 1
        FROM "documents" d
        WHERE d."researchProposalId" = p."id"
          AND d."isDeleted" = false
          AND d."version" = p."currentVersion"
    )
   OR (
        SELECT COUNT(DISTINCT d."version")
        FROM "documents" d
        WHERE d."researchProposalId" = p."id"
          AND d."isDeleted" = false
          AND d."isCurrentVersion" = true
    ) > 1;

INSERT INTO "document_migration_issues" (
    "id",
    "entityType",
    "entityId",
    "reason",
    "details"
)
SELECT
    'legacy-thesis-issue-' || md5(t."id"),
    'THESIS',
    t."id",
    'LEGACY_CURRENT_VERSION_AMBIGUOUS',
    jsonb_build_object(
        'currentDocumentVersions',
        COALESCE(
            (
                SELECT jsonb_agg(DISTINCT d."version")
                FROM "documents" d
                WHERE d."thesisId" = t."id"
                  AND d."documentType" = 'THESIS'
                  AND d."isDeleted" = false
                  AND d."isCurrentVersion" = true
            ),
            '[]'::jsonb
        )
    )
FROM "theses" t
WHERE (
    SELECT COUNT(DISTINCT d."version")
    FROM "documents" d
    WHERE d."thesisId" = t."id"
      AND d."documentType" = 'THESIS'
      AND d."isDeleted" = false
      AND d."isCurrentVersion" = true
) > 1;

INSERT INTO "proposal_versions" (
    "id",
    "researchProposalId",
    "versionNumber",
    "isCurrent",
    "manifestHash",
    "submittedByUserId",
    "submittedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-pv-' || md5(d."researchProposalId" || ':' || d."version"::text),
    d."researchProposalId",
    d."version",
    d."version" = p."currentVersion",
    'legacy-' || md5(string_agg(d."id" || ':' || d."storagePath", '|' ORDER BY d."id")),
    s."userId",
    MIN(d."createdAt"),
    MIN(d."createdAt"),
    MAX(d."updatedAt")
FROM "documents" d
JOIN "research_proposals" p ON p."id" = d."researchProposalId"
JOIN "students" s ON s."id" = p."studentId"
WHERE d."researchProposalId" IS NOT NULL
  AND d."isDeleted" = false
GROUP BY d."researchProposalId", d."version", p."currentVersion", s."userId";

INSERT INTO "thesis_versions" (
    "id",
    "thesisId",
    "versionNumber",
    "isCurrent",
    "manifestHash",
    "submittedByUserId",
    "submittedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-tv-' || md5(d."thesisId" || ':' || d."version"::text),
    d."thesisId",
    d."version",
    CASE
        WHEN (
            SELECT COUNT(DISTINCT current_doc."version")
            FROM "documents" current_doc
            WHERE current_doc."thesisId" = d."thesisId"
              AND current_doc."documentType" = 'THESIS'
              AND current_doc."isDeleted" = false
              AND current_doc."isCurrentVersion" = true
        ) = 1
        THEN BOOL_OR(d."isCurrentVersion")
        WHEN (
            SELECT COUNT(DISTINCT current_doc."version")
            FROM "documents" current_doc
            WHERE current_doc."thesisId" = d."thesisId"
              AND current_doc."documentType" = 'THESIS'
              AND current_doc."isDeleted" = false
              AND current_doc."isCurrentVersion" = true
        ) = 0
        THEN d."version" = (
            SELECT MAX(latest_doc."version")
            FROM "documents" latest_doc
            WHERE latest_doc."thesisId" = d."thesisId"
              AND latest_doc."documentType" = 'THESIS'
              AND latest_doc."isDeleted" = false
        )
        ELSE false
    END,
    'legacy-' || md5(string_agg(d."id" || ':' || d."storagePath", '|' ORDER BY d."id")),
    s."userId",
    MIN(d."createdAt"),
    MIN(d."createdAt"),
    MAX(d."updatedAt")
FROM "documents" d
JOIN "theses" t ON t."id" = d."thesisId"
JOIN "students" s ON s."id" = t."studentId"
WHERE d."thesisId" IS NOT NULL
  AND d."documentType" = 'THESIS'
  AND d."isDeleted" = false
GROUP BY d."thesisId", d."version", s."userId";

UPDATE "documents" d
SET "proposalVersionId" = pv."id"
FROM "proposal_versions" pv
WHERE pv."researchProposalId" = d."researchProposalId"
  AND pv."versionNumber" = d."version";

UPDATE "documents" d
SET "thesisVersionId" = tv."id"
FROM "thesis_versions" tv
WHERE tv."thesisId" = d."thesisId"
  AND tv."versionNumber" = d."version"
  AND d."documentType" = 'THESIS';

UPDATE "evaluation_forms" ef
SET
    "proposalVersionId" = pv."id",
    "evidenceManifestHash" = pv."manifestHash"
FROM "proposal_versions" pv
WHERE pv."researchProposalId" = ef."researchProposalId"
  AND pv."isCurrent" = true;

UPDATE "thesis_examiner_assignments" tea
SET
    "thesisVersionId" = tv."id",
    "evidenceManifestHash" = tv."manifestHash"
FROM "thesis_versions" tv
WHERE tv."thesisId" = tea."thesisId"
  AND tv."isCurrent" = true;

CREATE UNIQUE INDEX "proposal_versions_researchProposalId_versionNumber_key"
    ON "proposal_versions"("researchProposalId", "versionNumber");
CREATE UNIQUE INDEX "proposal_versions_one_current_per_proposal"
    ON "proposal_versions"("researchProposalId")
    WHERE "isCurrent" = true;
CREATE INDEX "proposal_versions_researchProposalId_isCurrent_idx"
    ON "proposal_versions"("researchProposalId", "isCurrent");

CREATE UNIQUE INDEX "thesis_versions_thesisId_versionNumber_key"
    ON "thesis_versions"("thesisId", "versionNumber");
CREATE UNIQUE INDEX "thesis_versions_one_current_per_thesis"
    ON "thesis_versions"("thesisId")
    WHERE "isCurrent" = true;
CREATE INDEX "thesis_versions_thesisId_isCurrent_idx"
    ON "thesis_versions"("thesisId", "isCurrent");

CREATE UNIQUE INDEX "upload_sessions_capabilityTokenHash_key"
    ON "upload_sessions"("capabilityTokenHash");
CREATE UNIQUE INDEX "upload_sessions_idempotencyKey_key"
    ON "upload_sessions"("idempotencyKey");
CREATE INDEX "upload_sessions_ownerUserId_status_idx"
    ON "upload_sessions"("ownerUserId", "status");
CREATE INDEX "upload_sessions_status_expiresAt_idx"
    ON "upload_sessions"("status", "expiresAt");

CREATE UNIQUE INDEX "staged_upload_files_storagePath_key"
    ON "staged_upload_files"("storagePath");
CREATE UNIQUE INDEX "staged_upload_files_documentId_key"
    ON "staged_upload_files"("documentId");
CREATE UNIQUE INDEX "staged_upload_files_uploadSessionId_ordinal_key"
    ON "staged_upload_files"("uploadSessionId", "ordinal");
CREATE INDEX "staged_upload_files_uploadSessionId_status_idx"
    ON "staged_upload_files"("uploadSessionId", "status");

CREATE INDEX "document_access_events_actorUserId_occurredAt_idx"
    ON "document_access_events"("actorUserId", "occurredAt");
CREATE INDEX "document_access_events_documentId_occurredAt_idx"
    ON "document_access_events"("documentId", "occurredAt");
CREATE INDEX "document_migration_issues_entityType_entityId_idx"
    ON "document_migration_issues"("entityType", "entityId");
CREATE INDEX "document_migration_issues_resolvedAt_createdAt_idx"
    ON "document_migration_issues"("resolvedAt", "createdAt");
CREATE INDEX "public_request_rate_limits_windowStart_idx"
    ON "public_request_rate_limits"("windowStart");

CREATE INDEX "documents_proposalVersionId_idx" ON "documents"("proposalVersionId");
CREATE INDEX "documents_thesisVersionId_idx" ON "documents"("thesisVersionId");
CREATE INDEX "evaluation_forms_proposalVersionId_idx" ON "evaluation_forms"("proposalVersionId");
DROP INDEX "evaluation_forms_researchProposalId_examinerId_key";
CREATE UNIQUE INDEX "evaluation_forms_proposalVersionId_examinerId_key"
    ON "evaluation_forms"("proposalVersionId", "examinerId");
CREATE INDEX "thesis_examiner_assignments_thesisVersionId_idx"
    ON "thesis_examiner_assignments"("thesisVersionId");

ALTER TABLE "proposal_versions"
    ADD CONSTRAINT "proposal_versions_researchProposalId_fkey"
    FOREIGN KEY ("researchProposalId") REFERENCES "research_proposals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "thesis_versions"
    ADD CONSTRAINT "thesis_versions_thesisId_fkey"
    FOREIGN KEY ("thesisId") REFERENCES "theses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_proposalVersionId_fkey"
    FOREIGN KEY ("proposalVersionId") REFERENCES "proposal_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_thesisVersionId_fkey"
    FOREIGN KEY ("thesisVersionId") REFERENCES "thesis_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluation_forms"
    ADD CONSTRAINT "evaluation_forms_proposalVersionId_fkey"
    FOREIGN KEY ("proposalVersionId") REFERENCES "proposal_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "thesis_examiner_assignments"
    ADD CONSTRAINT "thesis_examiner_assignments_thesisVersionId_fkey"
    FOREIGN KEY ("thesisVersionId") REFERENCES "thesis_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staged_upload_files"
    ADD CONSTRAINT "staged_upload_files_uploadSessionId_fkey"
    FOREIGN KEY ("uploadSessionId") REFERENCES "upload_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staged_upload_files"
    ADD CONSTRAINT "staged_upload_files_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_access_events"
    ADD CONSTRAINT "document_access_events_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
