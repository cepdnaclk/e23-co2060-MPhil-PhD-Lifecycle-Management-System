import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pglms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(),
}));

const mockCreateSignedUrl = vi.fn(async (filePath: string) => {
  return {
    data: {
      signedUrl: `https://storage.example.test/read?path=${encodeURIComponent(filePath)}`,
    },
    error: null,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      create: vi.fn(),
    },
    thesis: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/documents", () => {
  class DocumentRepositoryError extends Error {
    status = 403;
  }
  return {
    DocumentRepositoryError,
    assertDocumentsAccessible: vi.fn(
      async (_documentIds: string[], auth: { userId: string }) => {
        if (auth.userId === "db-examiner-2") {
          throw new DocumentRepositoryError("Thesis access denied.");
        }
      },
    ),
    getDocumentDownloadUrl: vi
      .fn()
      .mockResolvedValue("https://storage.example.test/read?thesis=1"),
  };
});

import { getAuth } from "firebase-admin/auth";

import { GET as downloadThesis } from "@/app/api/theses/[id]/download/route";
import { prisma } from "@/lib/prisma/client";
import { resetSupabaseClientForTests } from "@/lib/storage";

describe("thesis download integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseClientForTests();

    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "mock-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "demo-bucket");

    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: {
      where: { firebaseUid?: string };
    }) => {
      const { where } = args;

      if (where.firebaseUid === "firebase-examiner-1") {
        return {
          id: "db-examiner-1",
          firebaseUid: "firebase-examiner-1",
          email: "examiner1@example.com",
          isActive: true,
          role: "EXAMINER",
        } as never;
      }

      if (where.firebaseUid === "firebase-examiner-2") {
        return {
          id: "db-examiner-2",
          firebaseUid: "firebase-examiner-2",
          email: "examiner2@example.com",
          isActive: true,
          role: "EXAMINER",
        } as never;
      }

      return null;
    }) as never);

    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "EXAMINER_ASSIGNED") {
          return {
            uid: "firebase-examiner-1",
            email: "examiner1@example.com",
            role: "EXAMINER",
          };
        }

        if (token === "EXAMINER_OTHER") {
          return {
            uid: "firebase-examiner-2",
            email: "examiner2@example.com",
            role: "EXAMINER",
          };
        }

        throw new Error("Token expired");
      }),
    } as never);

  });

  it("allows an assigned examiner to generate a signed thesis download URL", async () => {
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      title: "Adaptive Systems Thesis",
      status: "UNDER_EXAMINATION",
      student: {
        id: "student-1",
        user: {
          id: "db-student-1",
          displayName: "Student One",
          email: "student@example.com",
        },
      },
      examinerAssignments: [
        {
          examinerId: "examiner-1",
          examinerUserId: "db-examiner-1",
        },
      ],
      documents: [
        {
          id: "doc-1",
          fileName: "thesis.pdf",
          storagePath: "theses/student-1/thesis.pdf",
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date("2026-05-01T04:00:00.000Z"),
        },
      ],
      versions: [],
    } as never);

    const response = await downloadThesis(
      new Request("http://localhost/api/theses/thesis-1/download", {
        headers: {
          authorization: "Bearer EXAMINER_ASSIGNED",
        },
      }) as never,
      {
        params: {
          id: "thesis-1",
        },
      } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      document: {
        storagePath: "theses/student-1/thesis.pdf",
        isCurrentVersion: true,
      },
      expiresInMinutes: 15,
    });
  });

  it("returns 403 for a non-assigned examiner", async () => {
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      title: "Adaptive Systems Thesis",
      status: "UNDER_EXAMINATION",
      student: {
        id: "student-1",
        user: {
          id: "db-student-1",
          displayName: "Student One",
          email: "student@example.com",
        },
      },
      examinerAssignments: [
        {
          examinerId: "examiner-1",
          examinerUserId: "db-examiner-1",
        },
      ],
      documents: [
        {
          id: "doc-1",
          fileName: "thesis.pdf",
          storagePath: "theses/student-1/thesis.pdf",
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date("2026-05-01T04:00:00.000Z"),
        },
      ],
      versions: [],
    } as never);

    const response = await downloadThesis(
      new Request("http://localhost/api/theses/thesis-1/download", {
        headers: {
          authorization: "Bearer EXAMINER_OTHER",
        },
      }) as never,
      {
        params: {
          id: "thesis-1",
        },
      } as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Thesis access denied.",
    });
  });
});
