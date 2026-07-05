import { describe, expect, it, vi } from "vitest";

import {
  DocumentRepositoryError,
  searchDocuments,
  softDeleteDocument,
} from "@/lib/documents";
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("searchDocuments", () => {
  it("excludes isDeleted documents from standard search results", async () => {
    const { prisma } = await import("@/lib/prisma/client");
    const findManySpy = vi.spyOn(prisma.document, "findMany");

    await searchDocuments({}, mockStudentAuth);

    const callArgs = findManySpy.mock.calls[0]?.[0];
    expect(callArgs?.where).toMatchObject({
      AND: expect.arrayContaining([
        { isDeleted: false },
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
