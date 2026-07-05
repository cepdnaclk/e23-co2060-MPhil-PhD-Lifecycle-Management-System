import {
  DocumentType,
  EthicsApprovalStatus,
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

const REPOSITORY_DOCUMENT_TYPES = [
  DocumentType.APPLICATION_ATTACHMENT,
  DocumentType.PROPOSAL,
  DocumentType.ETHICS_APPROVAL,
  DocumentType.THESIS,
  DocumentType.PROGRESS_REPORT,
  DocumentType.CORRECTION,
] as const;

const REPOSITORY_DOCUMENT_TYPE_SET = new Set<string>(REPOSITORY_DOCUMENT_TYPES);

const proposalStatusTags = new Set<string>(
  Object.values(ProposalStatus).map((status) => status.toLowerCase()),
);

const thesisStatusTags = new Set<string>(
  Object.values(ThesisStatus).map((status) => status.toLowerCase()),
);

const ethicsStatusTags = new Set<string>(
  Object.values(EthicsApprovalStatus).map((status) => status.toLowerCase()),
);

// ---------------------------------------------------------------------------
// Access control — builds the Prisma `where` scope per role
// ---------------------------------------------------------------------------

async function buildAccessScope(
  auth: AuthenticatedUserContext,
): Promise<Prisma.DocumentWhereInput> {
  switch (auth.role) {
    case "ADMINISTRATOR":
      return {};

    case "STUDENT": {
      const student = await prisma.student.findFirst({
        where: { userId: auth.userId },
        select: { id: true },
      });

      if (!student) {
        throw new DocumentRepositoryError("Student profile not found.", 403);
      }

      return {
        OR: [
          { studentId: student.id },
          {
            application: {
              is: {
                studentId: student.id,
              },
            },
          },
        ],
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
        ],
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
        where: { examinerId: examiner.id },
        select: { thesisId: true },
      });

      const assignedThesisIds = assignments.map((a) => a.thesisId);

      // Examiners may only see THESIS documents for their assigned theses
      return {
        documentType: DocumentType.THESIS,
        thesisId: { in: assignedThesisIds },
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
        status: true;
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
        isOverdue: true;
        isSupervisorSignedOff: true;
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

function buildRepositoryScope(): Prisma.DocumentWhereInput {
  return {
    documentType: {
      in: [...REPOSITORY_DOCUMENT_TYPES],
    },
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
          isSupervisorSignedOff: true,
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

  if (ethicsStatusTags.has(normalizedTag)) {
    return {
      ethicsApproval: {
        is: {
          status: tagEnumValue as EthicsApprovalStatus,
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
    tags.add(document.ethicsApproval.status.toLowerCase().replace(/_/g, "-"));
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

    if (document.progressReport.isSupervisorSignedOff) {
      tags.add("signed-off");
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

  const accessScope = await buildAccessScope(auth);

  return prisma.document.findFirst({
    where: {
      id: documentId,
      ...buildRepositoryScope(),
      ...accessScope,
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

  const accessScope = await buildAccessScope(auth);

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
          status: true,
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
          isOverdue: true,
          isSupervisorSignedOff: true,
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
        buildRepositoryScope(),
        accessScope,
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
      throw new DocumentRepositoryError(
        "You do not have permission to access this document.",
        403,
      );
    }

    // Block examiners from non-thesis documents
    if (auth.role === "EXAMINER" && document.documentType !== DocumentType.THESIS) {
      throw new DocumentRepositoryError(
        "Examiners may only access THESIS documents.",
        403,
      );
    }
  }

  return generateDownloadSignedUrl(document.storagePath);
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
