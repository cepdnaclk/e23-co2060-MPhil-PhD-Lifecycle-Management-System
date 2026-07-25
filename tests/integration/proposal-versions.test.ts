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
    researchProposal: {
      findUnique: vi.fn(),
    },
  },
}));

import { getAuth } from "firebase-admin/auth";

import { GET as downloadProposalVersion } from "@/app/api/proposals/[id]/versions/[v]/download/route";
import { prisma } from "@/lib/prisma/client";
import { resetSupabaseClientForTests } from "@/lib/storage";

describe("proposal version integration", () => {
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

      if (where.firebaseUid === "firebase-supervisor-1") {
        return {
          id: "db-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          email: "supervisor@example.com",
          isActive: true,
          role: "SUPERVISOR",
        } as never;
      }

      if (where.firebaseUid === "firebase-student-1") {
        return {
          id: "db-student-1",
          firebaseUid: "firebase-student-1",
          email: "student@example.com",
          isActive: true,
          role: "STUDENT",
        } as never;
      }

      return null;
    }) as never);

    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "SUPERVISOR") {
          return {
            uid: "firebase-supervisor-1",
            email: "supervisor@example.com",
            role: "SUPERVISOR",
          };
        }

        if (token === "STUDENT") {
          return {
            uid: "firebase-student-1",
            email: "student@example.com",
            role: "STUDENT",
          };
        }

        throw new Error("Token expired");
      }),
    } as never);

  });

  it("allows an assigned supervisor to download a previous proposal version", async () => {
    vi.mocked(prisma.researchProposal.findUnique).mockResolvedValue({
      id: "proposal-1",
      title: "Adaptive Proposal",
      status: "UNDER_REVIEW",
      student: {
        id: "student-1",
        user: {
          id: "db-student-1",
          displayName: "Student One",
          email: "student@example.com",
        },
        supervisorAssignments: [
          {
            supervisorId: "supervisor-1",
            supervisorUserId: "db-supervisor-1",
          },
        ],
      },
      documents: [
        {
          id: "doc-1",
          fileName: "proposal-v1.pdf",
          storagePath: "proposals/student-1/1/proposal-v1.pdf",
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: false,
          createdAt: new Date("2026-04-20T10:00:00.000Z"),
        },
        {
          id: "doc-2",
          fileName: "proposal-v2.pdf",
          storagePath: "proposals/student-1/2/proposal-v2.pdf",
          mimeType: "application/pdf",
          version: 2,
          isCurrentVersion: true,
          createdAt: new Date("2026-04-30T10:00:00.000Z"),
        },
      ],
    } as never);

    const response = await downloadProposalVersion(
      new Request("http://localhost/api/proposals/proposal-1/versions/1/download", {
        headers: {
          authorization: "Bearer SUPERVISOR",
        },
      }) as never,
      {
        params: {
          id: "proposal-1",
          v: "1",
        },
      } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: {
        version: 1,
        isCurrentVersion: false,
        storagePath: "proposals/student-1/1/proposal-v1.pdf",
      },
      expiresInMinutes: 15,
    });
  });

  it("does not expose a delete handler for proposal versions", async () => {
    const route = await import("@/app/api/proposals/[id]/versions/[v]/route");

    expect("DELETE" in route).toBe(false);
  });
});
