import { createHash } from "node:crypto";

import {
  DocumentAccessAction,
  DocumentAccessDecision,
  DocumentType,
  ProposalStatus,
  ThesisStatus,
  type Prisma,
} from "@prisma/client";

import { generateDownloadSignedUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class DocumentRepositoryError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 410,
  ) {
    super(message);
    this.name = "DocumentRepositoryError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentSearchQuery = {
  q?: string;
  category?: string;
  tag?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export type DocumentListItem = {
  id: string;
  documentType: DocumentType;
  fileName: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  isDeleted: boolean;
  storagePath: string;
  studentId: string | null;
  applicationId: string | null;
  researchProposalId: string | null;
  ethicsApprovalId: string | null;
  progressReportId: string | null;
  thesisId: string | null;
  correctionDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STANDARD_REPOSITORY_DOCUMENT_TYPES = [
  DocumentType.APPLICATION_ATTACHMENT,
  DocumentType.PROPOSAL,
  DocumentType.ETHICS_APPROVAL,
  DocumentType.THESIS,
  DocumentType.PROGRESS_REPORT,
  DocumentType.CORRECTION,
] as const;

const REPOSITORY_DOCUMENT_TYPES = [
  ...STANDARD_REPOSITORY_DOCUMENT_TYPES,
  DocumentType.REVIEW_ATTACHMENT,
] as const;

const REPOSITORY_DOCUMENT_TYPE_SET = new Set<string>(REPOSITORY_DOCUMENT_TYPES);

const proposalStatusTags = new Set<string>(
  Object.values(ProposalStatus).map((status) => status.toLowerCase()),
);

const thesisStatusTags = new Set<string>(
  Object.values(ThesisStatus).map((status) => status.toLowerCase()),
);

// ---------------------------------------------------------------------------
// Access control — builds the Prisma `where` scope per role
// ---------------------------------------------------------------------------

type RoleDocumentAccess = {
  accessibleStudentIds: string[];
  where: Prisma.DocumentWhereInput;
};

async function buildAccessScope(
  auth: AuthenticatedUserContext,
): Promise<RoleDocumentAccess> {
  switch (auth.role) {
    case "ADMINISTRATOR":
    case "HOD":
      return {
        accessibleStudentIds: [],
        where: {},
      };

    case "STUDENT": {
      const student = await prisma.student.findFirst({
        where: { userId: auth.userId },
        select: { id: true },
      });

      if (!student) {
        throw new DocumentRepositoryError("Student profile not found.", 403);
      }

      return {
        accessibleStudentIds: [student.id],
        where: {
          OR: [
            { studentId: student.id },
            {
              application: {
                is: {
                  studentId: student.id,
                },
              },
            },
            {
              researchProposal: {
                is: {
                  studentId: student.id,
                },
              },
            },
            {
              ethicsApproval: {
                is: {
                  studentId: student.id,
                },
              },
            },
            {
              progressReport: {
                is: {
                  studentId: student.id,
                },
              },
            },
            {
              thesis: {
                is: {
                  studentId: student.id,
                },
              },
            },
            {
              correctionDocument: {
                is: {
                  thesis: {
                    is: {
                      studentId: student.id,
                    },
                  },
                },
              },
            },
          ],
        },
      };
    }

    case "SUPERVISOR": {
      const supervisor = await prisma.supervisor.findFirst({
        where: { userId: auth.userId },
        select: { id: true },
      });

      if (!supervisor) {
        throw new DocumentRepositoryError("Supervisor profile not found.", 403);
      }

      const assignments = await prisma.supervisorAssignment.findMany({
        where: { supervisorId: supervisor.id },
        select: { studentId: true },
      });

      const assignedStudentIds = assignments.map((a) => a.studentId);

      return {
        accessibleStudentIds: assignedStudentIds,
        where: {
          OR: [
            { studentId: { in: assignedStudentIds } },
            {
              application: {
                is: {
                  studentId: {
                    in: assignedStudentIds,
                  },
                },
              },
            },
            {
              researchProposal: {
                is: {
                  studentId: {
                    in: assignedStudentIds,
                  },
                },
              },
            },
            {
              ethicsApproval: {
                is: {
                  studentId: {
                    in: assignedStudentIds,
                  },
                },
              },
            },
            {
              progressReport: {
                is: {
                  studentId: {
                    in: assignedStudentIds,
                  },
                },
              },
            },
            {
              thesis: {
                is: {
                  studentId: {
                    in: assignedStudentIds,
                  },
                },
              },
            },
            {
              correctionDocument: {
                is: {
                  thesis: {
                    is: {
                      studentId: {
                        in: assignedStudentIds,
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      };
    }

    case "EXAMINER": {
      const examiner = await prisma.examiner.findFirst({
        where: { userId: auth.userId },
        select: { id: true },
      });

      if (!examiner) {
        throw new DocumentRepositoryError("Examiner profile not found.", 403);
      }

      const assignments = await prisma.thesisExaminerAssignment.findMany({
        where: { examinerId: examiner.id, status: "ACCEPTED" },
        select: { thesisId: true, thesisVersionId: true },
      });

      const assignedVersionIds = assignments.flatMap((assignment) =>
        assignment.thesisVersionId ? [assignment.thesisVersionId] : [],
      );
      const legacyAssignedThesisIds = assignments.flatMap((assignment) =>
        assignment.thesisVersionId ? [] : [assignment.thesisId],
      );

      // Examiners may see only the exact thesis evidence assigned to them and
      // correction submissions that originate from that assigned version.
      return {
        accessibleStudentIds: [],
        where: {
          OR: [
            {
              documentType: DocumentType.THESIS,
              OR: [
                { thesisVersionId: { in: assignedVersionIds } },
                { thesisId: { in: legacyAssignedThesisIds } },
              ],
            },
            {
              documentType: DocumentType.CORRECTION,
              correctionSubmission: {
                is: {
                  correctionOrder: {
                    is: {
                      originatingThesisVersionId: {
                        in: assignedVersionIds,
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      };
    }

    default:
      throw new DocumentRepositoryError("Unsupported role.", 403);
  }
}

type RepositoryDocumentRecord = Prisma.DocumentGetPayload<{
  select: {
    id: true;
    documentType: true;
    fileName: true;
    mimeType: true;
    version: true;
    isCurrentVersion: true;
    isDeleted: true;
    storagePath: true;
    studentId: true;
    applicationId: true;
    researchProposalId: true;
    ethicsApprovalId: true;
    progressReportId: true;
    thesisId: true;
    correctionDocumentId: true;
    createdAt: true;
    updatedAt: true;
    researchProposal: {
      select: {
        title: true;
        abstract: true;
        status: true;
      };
    };
    ethicsApproval: {
      select: {
        title: true;
        summary: true;
      };
    };
    application: {
      select: {
        applicantName: true;
        researchArea: true;
        statementOfPurpose: true;
        status: true;
      };
    };
    progressReport: {
      select: {
        periodLabel: true;
        narrative: true;
        status: true;
        isOverdue: true;
      };
    };
    thesis: {
      select: {
        title: true;
        abstract: true;
        status: true;
      };
    };
    correctionDocument: {
      select: {
        correctionType: true;
        description: true;
        isApproved: true;
        thesis: {
          select: {
            title: true;
          };
        };
      };
    };
  };
}>;

function normalizeTag(tag?: string | null) {
  return tag?.trim().toLowerCase().replace(/[\s_]+/g, "-") ?? null;
}

function normalizeDocumentTypeCategory(category?: string | null) {
  const normalized = category?.trim().toUpperCase() ?? null;

  if (!normalized) {
    return null;
  }

  if (!REPOSITORY_DOCUMENT_TYPE_SET.has(normalized)) {
    throw new DocumentRepositoryError(
      "Unsupported document category.",
      400,
    );
  }

  return normalized as DocumentType;
}

function buildReleasedReviewAttachmentScope(
  accessibleStudentIds: string[],
): Prisma.DocumentWhereInput {
  return {
    OR: [
      {
        AND: [
          { documentType: DocumentType.REVIEW_ATTACHMENT },
          { evaluationFormId: { not: null } },
          { thesisExaminerAssignmentId: null },
          {
            evaluationForm: {
              is: {
                releasedAt: { not: null },
                researchProposal: {
                  is: {
                    studentId: { in: accessibleStudentIds },
                  },
                },
              },
            },
          },
        ],
      },
      {
        AND: [
          { documentType: DocumentType.REVIEW_ATTACHMENT },
          { evaluationFormId: null },
          { thesisExaminerAssignmentId: { not: null } },
          {
            thesisExaminerAssignment: {
              is: {
                releasedAt: { not: null },
                thesis: {
                  is: {
                    studentId: { in: accessibleStudentIds },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

function buildRepositoryScope(
  role: AuthenticatedUserContext["role"],
  accessibleStudentIds: string[],
): Prisma.DocumentWhereInput {
  if (role === "ADMINISTRATOR") {
    return {
      documentType: {
        in: [...REPOSITORY_DOCUMENT_TYPES],
      },
    };
  }

  return {
    OR: [
      {
        AND: [
          {
            documentType: {
              in: [...STANDARD_REPOSITORY_DOCUMENT_TYPES],
            },
          },
          { evaluationFormId: null },
          { thesisExaminerAssignmentId: null },
        ],
      },
      ...(role === "STUDENT" || role === "SUPERVISOR"
        ? [buildReleasedReviewAttachmentScope(accessibleStudentIds)]
        : []),
    ],
  };
}

function buildTagFilter(tag?: string | null): Prisma.DocumentWhereInput {
  const normalizedTag = normalizeTag(tag);

  if (!normalizedTag) {
    return {};
  }

  if (normalizedTag === "proposal" || normalizedTag === "proposals") {
    return { documentType: DocumentType.PROPOSAL };
  }

  if (
    normalizedTag === "ethics" ||
    normalizedTag === "ethics-approval" ||
    normalizedTag === "ethics-approvals"
  ) {
    return { documentType: DocumentType.ETHICS_APPROVAL };
  }

  if (normalizedTag === "application" || normalizedTag === "applications") {
    return { documentType: DocumentType.APPLICATION_ATTACHMENT };
  }

  if (normalizedTag === "thesis" || normalizedTag === "theses") {
    return { documentType: DocumentType.THESIS };
  }

  if (normalizedTag === "correction" || normalizedTag === "corrections") {
    return { documentType: DocumentType.CORRECTION };
  }

  if (
    normalizedTag === "progress" ||
    normalizedTag === "progress-report" ||
    normalizedTag === "progress-reports"
  ) {
    return { documentType: DocumentType.PROGRESS_REPORT };
  }

  if (normalizedTag === "current" || normalizedTag === "current-version") {
    return { isCurrentVersion: true };
  }

  if (normalizedTag === "overdue") {
    return {
      progressReport: {
        is: {
          isOverdue: true,
        },
      },
    };
  }

  if (normalizedTag === "signed-off" || normalizedTag === "supervisor-signed-off") {
    return {
      progressReport: {
        is: {
          status: "APPROVED",
        },
      },
    };
  }

  const tagEnumValue = normalizedTag.replace(/-/g, "_").toUpperCase();

  if (proposalStatusTags.has(normalizedTag)) {
    return {
      researchProposal: {
        is: {
          status: tagEnumValue as ProposalStatus,
        },
      },
    };
  }

  if (thesisStatusTags.has(normalizedTag)) {
    return {
      thesis: {
        is: {
          status: tagEnumValue as ThesisStatus,
        },
      },
    };
  }

  return {
    OR: [
      {
        application: {
          is: {
            OR: [
              {
                applicantName: {
                  contains: normalizedTag,
                  mode: "insensitive",
                },
              },
              {
                researchArea: {
                  contains: normalizedTag,
                  mode: "insensitive",
                },
              },
              {
                statementOfPurpose: {
                  contains: normalizedTag,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        researchProposal: {
          is: {
            title: {
              contains: normalizedTag,
              mode: "insensitive",
            },
          },
        },
      },
      {
        thesis: {
          is: {
            title: {
              contains: normalizedTag,
              mode: "insensitive",
            },
          },
        },
      },
      {
        progressReport: {
          is: {
            periodLabel: {
              contains: normalizedTag,
              mode: "insensitive",
            },
          },
        },
      },
      {
        correctionDocument: {
          is: {
            OR: [
              {
                description: {
                  contains: normalizedTag,
                  mode: "insensitive",
                },
              },
              {
                thesis: {
                  is: {
                    title: {
                      contains: normalizedTag,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

function buildTextFilter(q?: string | null): Prisma.DocumentWhereInput {
  if (!q?.trim()) {
    return {};
  }

  return {
    OR: [
      {
        fileName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        ethicsApproval: {
          is: {
            OR: [
              {
                title: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                summary: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        application: {
          is: {
            OR: [
              {
                applicantName: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                researchArea: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                statementOfPurpose: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        researchProposal: {
          is: {
            OR: [
              {
                title: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                abstract: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        thesis: {
          is: {
            OR: [
              {
                title: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                abstract: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        progressReport: {
          is: {
            OR: [
              {
                periodLabel: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                narrative: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        ethicsApproval: {
          is: {
            OR: [
              {
                title: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                summary: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
      {
        correctionDocument: {
          is: {
            OR: [
              {
                description: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                thesis: {
                  is: {
                    title: {
                      contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

function mapDocumentTags(document: RepositoryDocumentRecord) {
  const tags = new Set<string>();

  tags.add(document.documentType.toLowerCase());

  if (document.isCurrentVersion) {
    tags.add("current");
  }

  if (document.researchProposal) {
    tags.add(document.researchProposal.status.toLowerCase().replace(/_/g, "-"));
  }

  if (document.ethicsApproval) {
    tags.add("ethics");
    tags.add("ethics-approval");
  }

  if (document.application) {
    tags.add("application");
    tags.add(document.application.status.toLowerCase().replace(/_/g, "-"));
  }

  if (document.progressReport) {
    tags.add("progress-report");

    if (document.progressReport.isOverdue) {
      tags.add("overdue");
    }

    if (document.progressReport.status === "APPROVED") {
      tags.add("approved");
    }
  }

  if (document.thesis) {
    tags.add(document.thesis.status.toLowerCase().replace(/_/g, "-"));
  }

  if (document.correctionDocument) {
    tags.add("correction");
    tags.add(document.correctionDocument.correctionType.toLowerCase());

    if (document.correctionDocument.isApproved) {
      tags.add("approved");
    }
  }

  return [...tags];
}

function mapDocumentListItem(document: RepositoryDocumentRecord): DocumentListItem {
  const applicationTitle = document.application
    ? `Application Attachment - ${document.application.applicantName}`
    : null;
  const proposalTitle = document.researchProposal?.title ?? null;
  const ethicsTitle = document.ethicsApproval?.title ?? null;
  const thesisTitle = document.thesis?.title ?? null;
  const progressTitle = document.progressReport
    ? `Progress Report ${document.progressReport.periodLabel}`
    : null;
  const correctionTitle = document.correctionDocument
    ? `Correction - ${document.correctionDocument.thesis.title}`
    : null;

  const applicationSummary =
    document.application?.researchArea ??
    document.application?.statementOfPurpose ??
    null;
  const proposalSummary = document.researchProposal?.abstract ?? null;
  const ethicsSummary = document.ethicsApproval?.summary ?? null;
  const thesisSummary = document.thesis?.abstract ?? null;
  const progressSummary = document.progressReport?.narrative ?? null;
  const correctionSummary = document.correctionDocument?.description ?? null;

  return {
    id: document.id,
    documentType: document.documentType,
    fileName: document.fileName,
    title:
      applicationTitle ??
      proposalTitle ??
      ethicsTitle ??
      thesisTitle ??
      progressTitle ??
      correctionTitle,
    summary:
      applicationSummary ??
      proposalSummary ??
      ethicsSummary ??
      thesisSummary ??
      progressSummary ??
      correctionSummary,
    tags: mapDocumentTags(document),
    mimeType: document.mimeType,
    version: document.version,
    isCurrentVersion: document.isCurrentVersion,
    isDeleted: document.isDeleted,
    storagePath: document.storagePath,
    studentId: document.studentId,
    applicationId: document.applicationId,
    researchProposalId: document.researchProposalId,
    ethicsApprovalId: document.ethicsApprovalId,
    progressReportId: document.progressReportId,
    thesisId: document.thesisId,
    correctionDocumentId: document.correctionDocumentId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function checkAccess(
  documentId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role === "ADMINISTRATOR") {
    return prisma.document.findUnique({
      where: { id: documentId },
    });
  }

  const access = await buildAccessScope(auth);

  return prisma.document.findFirst({
    where: {
      AND: [
        { id: documentId },
        buildRepositoryScope(auth.role, access.accessibleStudentIds),
        access.where,
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Validate that the category filter is permitted for the given role
// ---------------------------------------------------------------------------

function assertCategoryAccessForRole(
  role: AuthenticatedUserContext["role"],
  category: DocumentType,
): void {
  if (role !== "EXAMINER") return;

  const allowedForExaminers: string[] = [DocumentType.THESIS];

  if (!allowedForExaminers.includes(category)) {
    throw new DocumentRepositoryError(
      "Examiners may only access THESIS documents.",
      403,
    );
  }
}

// ---------------------------------------------------------------------------
// searchDocuments
// ---------------------------------------------------------------------------

export async function searchDocuments(
  query: DocumentSearchQuery,
  auth: AuthenticatedUserContext,
): Promise<DocumentListItem[]> {
  const {
    q,
    category,
    tag,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = query;

  const normalizedCategory = normalizeDocumentTypeCategory(category);

  if (normalizedCategory) {
    assertCategoryAccessForRole(auth.role, normalizedCategory);
  }

  const access = await buildAccessScope(auth);

  const categoryFilter: Prisma.DocumentWhereInput = normalizedCategory
    ? { documentType: normalizedCategory }
    : {};

  const textFilter = buildTextFilter(q);
  const tagFilter = buildTagFilter(tag);

  const dateFilter: Prisma.DocumentWhereInput = {};
  if (startDate ?? endDate) {
    dateFilter.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const skip = (page - 1) * limit;

  const documents = await prisma.document.findMany({
    select: {
      id: true,
      documentType: true,
      fileName: true,
      mimeType: true,
      version: true,
      isCurrentVersion: true,
      isDeleted: true,
      storagePath: true,
      studentId: true,
      applicationId: true,
      researchProposalId: true,
      ethicsApprovalId: true,
      progressReportId: true,
      thesisId: true,
      correctionDocumentId: true,
      createdAt: true,
      updatedAt: true,
      researchProposal: {
        select: {
          title: true,
          abstract: true,
          status: true,
        },
      },
      ethicsApproval: {
        select: {
          title: true,
          summary: true,
        },
      },
      application: {
        select: {
          applicantName: true,
          researchArea: true,
          statementOfPurpose: true,
          status: true,
        },
      },
      progressReport: {
        select: {
          periodLabel: true,
          narrative: true,
          status: true,
          isOverdue: true,
        },
      },
      thesis: {
        select: {
          title: true,
          abstract: true,
          status: true,
        },
      },
      correctionDocument: {
        select: {
          correctionType: true,
          description: true,
          isApproved: true,
          thesis: {
            select: {
              title: true,
            },
          },
        },
      },
    },
    where: {
      AND: [
        { isDeleted: false },
        buildRepositoryScope(auth.role, access.accessibleStudentIds),
        access.where,
        categoryFilter,
        textFilter,
        tagFilter,
        dateFilter,
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip,
  });

  return documents.map(mapDocumentListItem);
}

// ---------------------------------------------------------------------------
// getDocumentDownloadUrl
// ---------------------------------------------------------------------------

export async function getDocumentDownloadUrl(
  documentId: string,
  auth: AuthenticatedUserContext,
): Promise<string> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new DocumentRepositoryError("Document not found.", 404);
  }

  // Soft-deleted: admins can still download, others receive 410 Gone
  if (document.isDeleted) {
    if (auth.role !== "ADMINISTRATOR") {
      await appendDocumentAccessEvent({
        auth,
        document,
        decision: DocumentAccessDecision.DENIED,
        reasonCode: "DOCUMENT_DELETED",
      });
      throw new DocumentRepositoryError(
        "This document has been removed and is no longer available.",
        410,
      );
    }
  }

  // Verify access scope for the requester (even if not deleted)
  if (auth.role !== "ADMINISTRATOR") {
    const accessible = await checkAccess(documentId, auth);

    if (!accessible) {
      await appendDocumentAccessEvent({
        auth,
        document,
        decision: DocumentAccessDecision.DENIED,
        reasonCode: "POLICY_DENIED",
      });
      throw new DocumentRepositoryError(
        "You do not have permission to access this document.",
        403,
      );
    }

    // Block examiners from non-thesis documents
    if (auth.role === "EXAMINER" && document.documentType !== DocumentType.THESIS) {
      await appendDocumentAccessEvent({
        auth,
        document,
        decision: DocumentAccessDecision.DENIED,
        reasonCode: "EXAMINER_DOCUMENT_TYPE_DENIED",
      });
      throw new DocumentRepositoryError(
        "Examiners may only access THESIS documents.",
        403,
      );
    }
  }

  const downloadUrl = await generateDownloadSignedUrl(document.storagePath);
  await appendDocumentAccessEvent({
    auth,
    document,
    decision: DocumentAccessDecision.ALLOWED,
    reasonCode: "POLICY_ALLOWED",
    signedUrlExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  return downloadUrl;
}

async function appendDocumentAccessEvent(input: {
  auth: AuthenticatedUserContext;
  document: { id: string; storagePath: string };
  decision: DocumentAccessDecision;
  reasonCode: string;
  signedUrlExpiresAt?: Date;
}) {
  const client = prisma as typeof prisma & {
    documentAccessEvent?: {
      create: (args: {
        data: {
          actorUserId: string;
          actorRole: AuthenticatedUserContext["role"];
          documentId: string;
          action: DocumentAccessAction;
          decision: DocumentAccessDecision;
          reasonCode: string;
          storagePathHash: string;
          signedUrlExpiresAt?: Date;
        };
      }) => Promise<unknown>;
    };
  };

  // Some focused unit tests provide a deliberately minimal Prisma double.
  // The real generated client always contains this append-only model.
  if (!client.documentAccessEvent) {
    return;
  }

  await client.documentAccessEvent.create({
    data: {
      actorUserId: input.auth.userId,
      actorRole: input.auth.role,
      documentId: input.document.id,
      action: DocumentAccessAction.DOWNLOAD,
      decision: input.decision,
      reasonCode: input.reasonCode,
      storagePathHash: createHash("sha256")
        .update(input.document.storagePath)
        .digest("hex"),
      signedUrlExpiresAt: input.signedUrlExpiresAt,
    },
  });
}

export async function assertDocumentsAccessible(
  documentIds: string[],
  auth: AuthenticatedUserContext,
) {
  for (const documentId of documentIds) {
    const document = await checkAccess(documentId, auth);
    if (!document) {
      throw new DocumentRepositoryError(
        "You do not have permission to access this document.",
        403,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// softDeleteDocument
// ---------------------------------------------------------------------------

export async function softDeleteDocument(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, isDeleted: true },
  });

  if (!document) {
    throw new DocumentRepositoryError("Document not found.", 404);
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { isDeleted: true },
  });
}
