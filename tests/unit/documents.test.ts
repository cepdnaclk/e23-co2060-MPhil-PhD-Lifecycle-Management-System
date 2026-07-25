import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DocumentRepositoryError,
  getDocumentDownloadUrl,
  searchDocuments,
  softDeleteDocument,
} from "@/lib/documents";
import { generateDownloadSignedUrl } from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

// ---------------------------------------------------------------------------
// Shared mock setup
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
    },
    supervisor: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    examiner: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    supervisorAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    thesisExaminerAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "doc-001",
          documentType: "THESIS",
          fileName: "thesis-v1.pdf",
          title: null,
          summary: null,
          tags: ["thesis", "current"],
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          isDeleted: false,
          storagePath: "theses/student-1/thesis-v1.pdf",
          studentId: "student-1",
          applicationId: null,
          researchProposalId: null,
          progressReportId: null,
          thesisId: "thesis-1",
          correctionDocumentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          application: null,
          researchProposal: null,
          progressReport: null,
          thesis: {
            title: "AI for Thesis Review",
            abstract: "A searchable thesis abstract.",
            status: "UNDER_EXAMINATION",
          },
          correctionDocument: null,
        },
      ]),
      findUnique: vi.fn().mockResolvedValue({
        id: "doc-001",
        documentType: "THESIS",
        fileName: "thesis-v1.pdf",
        mimeType: "application/pdf",
        version: 1,
        isCurrentVersion: true,
        isDeleted: false,
        storagePath: "theses/student-1/thesis-v1.pdf",
        studentId: "student-1",
        applicationId: null,
        researchProposalId: null,
        progressReportId: null,
        thesisId: "thesis-1",
        correctionDocumentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: "doc-001",
      }),
      update: vi.fn().mockResolvedValue({ id: "doc-001", isDeleted: true }),
    },
    documentAccessEvent: {
      create: vi.fn().mockResolvedValue({ id: "access-event-1" }),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  generateDownloadSignedUrl: vi.fn().mockResolvedValue("https://signed-url"),
}));

// ---------------------------------------------------------------------------
// Auth fixtures
// ---------------------------------------------------------------------------

const mockStudentAuth: AuthenticatedUserContext = {
  uid: "firebase-uid-1",
  userId: "user-1",
  firebaseUid: "firebase-uid-1",
  role: "STUDENT",
};

const mockAdminAuth: AuthenticatedUserContext = {
  uid: "firebase-uid-admin",
  userId: "user-admin",
  firebaseUid: "firebase-uid-admin",
  role: "ADMINISTRATOR",
};

const mockSupervisorAuth: AuthenticatedUserContext = {
  uid: "firebase-uid-supervisor",
  userId: "user-supervisor",
  firebaseUid: "firebase-uid-supervisor",
  role: "SUPERVISOR",
};

function repositoryScopeFromWhere(where: unknown) {
  return (where as { AND: Array<Record<string, unknown>> }).AND[1] as {
    OR: Array<{ AND?: unknown[]; OR?: Array<{ AND: unknown[] }> }>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("searchDocuments", () => {
  it("excludes deleted documents and release-gates review attachments for students", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({}, mockStudentAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    const repositoryScope = repositoryScopeFromWhere(callArgs?.where);

    expect(callArgs?.where).toMatchObject({
      AND: expect.arrayContaining([{ isDeleted: false }]),
    });
    expect(repositoryScope.OR[0]).toEqual({
      AND: [
        {
          documentType: {
            in: [
              "APPLICATION_ATTACHMENT",
              "PROPOSAL",
              "ETHICS_APPROVAL",
              "THESIS",
              "PROGRESS_REPORT",
              "CORRECTION",
            ],
          },
        },
        { evaluationFormId: null },
        { progressReportReviewId: null },
        { thesisExaminerAssignmentId: null },
      ],
    });
    expect(repositoryScope.OR[1]?.OR?.[0]).toEqual({
      AND: [
        { documentType: "REVIEW_ATTACHMENT" },
        { evaluationFormId: { not: null } },
        { progressReportReviewId: null },
        { thesisExaminerAssignmentId: null },
        {
          evaluationForm: {
            is: {
              releasedAt: { not: null },
              researchProposal: {
                is: {
                  studentId: { in: ["student-1"] },
                },
              },
            },
          },
        },
      ],
    });
  });

  it("derives released-review ownership from a supervisor's assigned students", async () => {
    const { prisma } = await import("@/lib/prisma/client");

    vi.spyOn(prisma.supervisor, "findFirst").mockResolvedValueOnce({
      id: "supervisor-1",
    } as never);
    vi.spyOn(prisma.supervisorAssignment, "findMany").mockResolvedValueOnce([
      { studentId: "student-2" },
    ] as never);
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({}, mockSupervisorAuth);

    const repositoryScope = repositoryScopeFromWhere(
      findManySpy.mock.calls[0]?.[0]?.where,
    );
    expect(repositoryScope.OR[1]?.OR?.[1]).toMatchObject({
      AND: expect.arrayContaining([
        {
          progressReportReview: {
            is: {
              releasedAt: { not: null },
              progressReport: {
                is: {
                  studentId: { in: ["student-2"] },
                },
              },
            },
          },
        },
      ]),
    });
  });

  it("blocks Examiners from requesting non-THESIS category", async () => {
    const examinerAuth: AuthenticatedUserContext = {
      ...mockStudentAuth,
      role: "EXAMINER",
    };

    await expect(
      searchDocuments({ category: "PROPOSAL" }, examinerAuth),
    ).rejects.toBeInstanceOf(DocumentRepositoryError);
  });

  it("allows Admin to search without scope restriction", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({ category: "THESIS" }, mockAdminAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    // Admin scope adds no additional constraints beyond isDeleted
    expect(callArgs?.where).not.toHaveProperty("studentId");
  });

  it("applies category filter to Prisma query", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({ category: "THESIS" }, mockAdminAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    expect(callArgs?.where).toMatchObject({
      AND: expect.arrayContaining([{ documentType: "THESIS" }]),
    });
  });

  it("applies tag filters for repository searches", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({ tag: "overdue" }, mockAdminAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    expect(callArgs?.where).toMatchObject({
      AND: expect.arrayContaining([
        {
          progressReport: {
            is: {
              isOverdue: true,
            },
          },
        },
      ]),
    });
  });

  it("searches related abstract fields in addition to filenames", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({ q: "searchable" }, mockAdminAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    expect(callArgs?.where).toMatchObject({
      AND: expect.arrayContaining([
        {
          OR: expect.arrayContaining([
            {
              thesis: {
                is: {
                  OR: expect.arrayContaining([
                    {
                      abstract: {
                        contains: "searchable",
                        mode: "insensitive",
                      },
                    },
                  ]),
                },
              },
            },
          ]),
        },
      ]),
    });
  });
});

describe("getDocumentDownloadUrl", () => {
  it("allows a student to download an older proposal document through the linked proposal", async () => {
    const { prisma } = await import("@/lib/prisma/client");

    vi.spyOn(prisma.document, "findUnique").mockResolvedValueOnce({
      id: "doc-proposal-1",
      documentType: "PROPOSAL",
      fileName: "proposal-v1.pdf",
      mimeType: "application/pdf",
      version: 1,
      isCurrentVersion: false,
      isDeleted: false,
      storagePath: "proposals/student-1/1/proposal-v1.pdf",
      studentId: null,
      applicationId: null,
      researchProposalId: "proposal-1",
      progressReportId: null,
      thesisId: null,
      correctionDocumentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const findFirstSpy = vi.spyOn(prisma.document, "findFirst").mockResolvedValueOnce({
      id: "doc-proposal-1",
    } as never);

    await expect(getDocumentDownloadUrl("doc-proposal-1", mockStudentAuth)).resolves.toBe(
      "https://signed-url",
    );

    expect(findFirstSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                {
                  researchProposal: {
                    is: {
                      studentId: "student-1",
                    },
                  },
                },
              ]),
            }),
          ]),
        },
      }),
    );
    expect(prisma.documentAccessEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user-1",
        actorRole: "STUDENT",
        documentId: "doc-proposal-1",
        action: "DOWNLOAD",
        decision: "ALLOWED",
        reasonCode: "POLICY_ALLOWED",
        storagePathHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        signedUrlExpiresAt: expect.any(Date),
      }),
    });
  });

  it("blocks an unreleased review attachment without generating a signed URL", async () => {
    const { prisma } = await import("@/lib/prisma/client");

    vi.spyOn(prisma.document, "findUnique").mockResolvedValueOnce({
      id: "review-document-1",
      documentType: "REVIEW_ATTACHMENT",
      fileName: "examiner-review.pdf",
      storagePath: "review-attachments/student-1/examiner-review.pdf",
      isDeleted: false,
    } as never);
    const findFirstSpy = vi
      .spyOn(prisma.document, "findFirst")
      .mockResolvedValueOnce(null);

    await expect(
      getDocumentDownloadUrl("review-document-1", mockStudentAuth),
    ).rejects.toMatchObject({ status: 403 });

    const repositoryScope = repositoryScopeFromWhere(
      findFirstSpy.mock.calls[0]?.[0]?.where,
    );
    expect(repositoryScope.OR[1]?.OR?.[0]).toMatchObject({
      AND: expect.arrayContaining([
        { documentType: "REVIEW_ATTACHMENT" },
        { evaluationFormId: { not: null } },
        { progressReportReviewId: null },
        { thesisExaminerAssignmentId: null },
        {
          evaluationForm: {
            is: {
              releasedAt: { not: null },
              researchProposal: {
                is: {
                  studentId: { in: ["student-1"] },
                },
              },
            },
          },
        },
      ]),
    });
    expect(generateDownloadSignedUrl).not.toHaveBeenCalled();
    expect(prisma.documentAccessEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: "review-document-1",
        decision: "DENIED",
        reasonCode: "POLICY_DENIED",
      }),
    });
  });

  it("allows a released, correctly scoped review attachment", async () => {
    const { prisma } = await import("@/lib/prisma/client");

    vi.spyOn(prisma.document, "findUnique").mockResolvedValueOnce({
      id: "review-document-1",
      documentType: "REVIEW_ATTACHMENT",
      fileName: "examiner-review.pdf",
      storagePath: "review-attachments/student-1/examiner-review.pdf",
      isDeleted: false,
    } as never);
    vi.spyOn(prisma.document, "findFirst").mockResolvedValueOnce({
      id: "review-document-1",
    } as never);

    await expect(
      getDocumentDownloadUrl("review-document-1", mockStudentAuth),
    ).resolves.toBe("https://signed-url");

    expect(generateDownloadSignedUrl).toHaveBeenCalledWith(
      "review-attachments/student-1/examiner-review.pdf",
    );
  });

  it("allows an administrator to inspect an unreleased review attachment", async () => {
    const { prisma } = await import("@/lib/prisma/client");

    vi.spyOn(prisma.document, "findUnique").mockResolvedValueOnce({
      id: "review-document-1",
      documentType: "REVIEW_ATTACHMENT",
      fileName: "examiner-review.pdf",
      storagePath: "review-attachments/student-1/examiner-review.pdf",
      isDeleted: false,
    } as never);

    await expect(
      getDocumentDownloadUrl("review-document-1", mockAdminAuth),
    ).resolves.toBe("https://signed-url");

    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });
});

describe("softDeleteDocument", () => {
  it("marks the document as isDeleted without calling Firebase delete", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const updateSpy = vi.spyOn(prisma.document, "update");

    await softDeleteDocument("doc-001");

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-001" },
        data: { isDeleted: true },
      }),
    );
  });

  it("throws 404 when the document does not exist", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    vi.spyOn(prisma.document, "findUnique").mockResolvedValueOnce(null);

    await expect(softDeleteDocument("nonexistent")).rejects.toBeInstanceOf(
      DocumentRepositoryError,
    );
  });
});
