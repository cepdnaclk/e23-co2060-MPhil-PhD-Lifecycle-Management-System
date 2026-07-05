import { ApplicationStatus, ProposalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pgsms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

const mockCreateSignedUploadUrl = vi.fn(async (filePath: string) => {
  return {
    data: {
      signedUrl: `https://storage.example.test/write?path=${encodeURIComponent(filePath)}`,
    },
    error: null,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
      })),
    },
  })),
}));

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalStatusChange: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    researchProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    document: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));


import {
  createProposalUploadUrl,
  submitResearchProposal,
} from "@/lib/proposals/submission";
import { prisma } from "@/lib/prisma/client";
import { resetSupabaseClientForTests } from "@/lib/storage";

describe("proposal workflow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseClientForTests();

    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "mock-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "demo-bucket");
  });

  it("keeps previous proposal versions accessible in the database after a re-upload", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
      },
      registrations: [{ id: "registration-1" }],
      supervisorAssignments: [],
      application: {
        id: "application-1",
        status: ApplicationStatus.ADMITTED,
        researchProposal: {
          id: "proposal-1",
          title: "Initial Proposal",
          abstract: "Initial abstract about the thesis direction and methods.",
          status: ProposalStatus.REJECTED,
          currentVersion: 1,
          applicationId: "application-1",
          createdAt: new Date("2026-04-20T10:00:00.000Z"),
          updatedAt: new Date("2026-04-22T10:00:00.000Z"),
          documents: [
            {
              id: "doc-1",
              fileName: "proposal-v1.pdf",
              storagePath: "proposals/student-1/1/proposal-v1.pdf",
              mimeType: "application/pdf",
              version: 1,
              isCurrentVersion: true,
              createdAt: new Date("2026-04-20T10:00:00.000Z"),
            },
          ],
        },
      },
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        document: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        researchProposal: {
          update: vi.fn().mockResolvedValue({
            id: "proposal-1",
            title: "Revised Proposal",
            abstract:
              "A revised abstract that addresses the rejection and clarifies the approach.",
            status: ProposalStatus.SUBMITTED,
            currentVersion: 2,
            applicationId: "application-1",
            createdAt: new Date("2026-04-20T10:00:00.000Z"),
            updatedAt: new Date("2026-04-30T09:00:00.000Z"),
            documents: [
              {
                id: "doc-2",
                fileName: "proposal-v2.pdf",
                storagePath: "proposals/student-1/2/proposal-v2.pdf",
                mimeType: "application/pdf",
                version: 2,
                isCurrentVersion: true,
                createdAt: new Date("2026-04-30T09:00:00.000Z"),
              },
              {
                id: "doc-1",
                fileName: "proposal-v1.pdf",
                storagePath: "proposals/student-1/1/proposal-v1.pdf",
                mimeType: "application/pdf",
                version: 1,
                isCurrentVersion: false,
                createdAt: new Date("2026-04-20T10:00:00.000Z"),
              },
            ],
          }),
        },
      };

      const result = await callback(tx as never);

      expect(tx.document.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            researchProposalId: "proposal-1",
            isCurrentVersion: true,
          }),
          data: {
            isCurrentVersion: false,
          },
        }),
      );
      expect(tx.researchProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentVersion: 2,
            status: ProposalStatus.SUBMITTED,
            documents: {
              create: expect.objectContaining({
                storagePath: "proposals/student-1/2/proposal-v2.pdf",
                version: 2,
                isCurrentVersion: true,
              }),
            },
          }),
        }),
      );

      return result;
    });

    const proposal = await submitResearchProposal(
      {
        title: "Revised Proposal",
        abstract:
          "A revised abstract that addresses the rejection and clarifies the approach.",
        document: {
          fileName: "proposal-v2.pdf",
          storagePath: "proposals/student-1/2/proposal-v2.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024 * 1024,
        },
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    expect(proposal.currentVersion).toBe(2);
    expect(proposal.documents).toHaveLength(2);
    expect(proposal.documents[0]).toMatchObject({
      version: 2,
      isCurrentVersion: true,
      storagePath: "proposals/student-1/2/proposal-v2.pdf",
    });
    expect(proposal.documents[1]).toMatchObject({
      version: 1,
      isCurrentVersion: false,
      storagePath: "proposals/student-1/1/proposal-v1.pdf",
    });
  });

  it("generates a signed upload URL and records the proposal storage path in PostgreSQL", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
      },
      registrations: [{ id: "registration-1" }],
      supervisorAssignments: [],
      application: {
        id: "application-1",
        status: ApplicationStatus.ADMITTED,
        researchProposal: null,
      },
    } as never);

    const uploadTarget = await createProposalUploadUrl(
      {
        fileName: "proposal.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 512000,
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    expect(uploadTarget.storagePath).toBe("proposals/student-1/1/proposal.pdf");
    expect(uploadTarget.signedUrl).toContain(
      encodeURIComponent("proposals/student-1/1/proposal.pdf"),
    );

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        researchProposal: {
          create: vi.fn().mockResolvedValue({
            id: "proposal-1",
            title: "New Proposal",
            abstract:
              "A first submission outlining the thesis direction, problem, and research method.",
            status: ProposalStatus.SUBMITTED,
            currentVersion: 1,
            applicationId: "application-1",
            createdAt: new Date("2026-04-30T09:00:00.000Z"),
            updatedAt: new Date("2026-04-30T09:00:00.000Z"),
            documents: [
              {
                id: "doc-1",
                fileName: "proposal.pdf",
                storagePath: "proposals/student-1/1/proposal.pdf",
                mimeType: "application/pdf",
                version: 1,
                isCurrentVersion: true,
                createdAt: new Date("2026-04-30T09:00:00.000Z"),
              },
            ],
          }),
        },
      };

      const result = await callback(tx as never);

      expect(tx.researchProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: "student-1",
            applicationId: "application-1",
            documents: {
              create: expect.objectContaining({
                storagePath: "proposals/student-1/1/proposal.pdf",
              }),
            },
          }),
        }),
      );

      return result;
    });

    const proposal = await submitResearchProposal(
      {
        title: "New Proposal",
        abstract:
          "A first submission outlining the thesis direction, problem, and research method.",
        document: {
          fileName: "proposal.pdf",
          storagePath: uploadTarget.storagePath,
          mimeType: "application/pdf",
          sizeBytes: 512000,
        },
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    expect(proposal.documents[0]?.storagePath).toBe(
      "proposals/student-1/1/proposal.pdf",
    );
  });

  it("auto-routes a newly submitted proposal to UNDER_REVIEW when supervisors are already assigned", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
      },
      registrations: [{ id: "registration-1" }],
      supervisorAssignments: [{ id: "assignment-1" }],
      application: {
        id: "application-1",
        status: ApplicationStatus.ADMITTED,
        researchProposal: null,
      },
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        researchProposal: {
          create: vi.fn().mockResolvedValue({
            id: "proposal-1",
            title: "Assigned Supervisor Proposal",
            abstract:
              "A first submission outlining a supervised research direction with clear scope and method.",
            status: ProposalStatus.UNDER_REVIEW,
            currentVersion: 1,
            applicationId: "application-1",
            createdAt: new Date("2026-04-30T09:00:00.000Z"),
            updatedAt: new Date("2026-04-30T09:00:00.000Z"),
            documents: [
              {
                id: "doc-1",
                fileName: "proposal.pdf",
                storagePath: "proposals/student-1/1/proposal.pdf",
                mimeType: "application/pdf",
                version: 1,
                isCurrentVersion: true,
                createdAt: new Date("2026-04-30T09:00:00.000Z"),
              },
            ],
          }),
        },
      };

      const result = await callback(tx as never);

      expect(tx.researchProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProposalStatus.UNDER_REVIEW,
          }),
        }),
      );

      return result;
    });

    const proposal = await submitResearchProposal(
      {
        title: "Assigned Supervisor Proposal",
        abstract:
          "A first submission outlining a supervised research direction with clear scope and method.",
        document: {
          fileName: "proposal.pdf",
          storagePath: "proposals/student-1/1/proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 512000,
        },
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    expect(proposal.status).toBe(ProposalStatus.UNDER_REVIEW);
  });
});
