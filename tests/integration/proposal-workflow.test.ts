import {
  ApplicationStatus,
  ProposalStatus,
  UploadPurpose,
  UploadSessionStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyProposalStatusChange: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/uploads/sessions", () => ({
  createStagedUploadSession: vi.fn(),
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    researchProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma/client";
import {
  createProposalUploadUrl,
  submitResearchProposal,
} from "@/lib/proposals/submission";
import {
  createStagedUploadSession,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";

const auth = {
  uid: "firebase-student-1",
  userId: "user-student-1",
  firebaseUid: "firebase-student-1",
  role: "STUDENT" as const,
  email: "student@example.com",
};

function mockEligibleStudent(supervisorAssignments: Array<{ id: string }> = []) {
  vi.mocked(prisma.student.findUnique).mockResolvedValue({
    id: "student-1",
    user: {
      id: auth.userId,
      email: auth.email,
      displayName: "Student One",
    },
    registrations: [{ id: "registration-1" }],
    supervisorAssignments,
    application: {
      id: "application-1",
      status: ApplicationStatus.ADMITTED,
      researchProposal: null,
    },
  } as never);
}

describe("proposal staged workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one sealed session for a multi-file proposal package", async () => {
    mockEligibleStudent();
    vi.mocked(createStagedUploadSession).mockResolvedValue({
      uploadSessionId: "f7697667-a155-4a45-aa8a-172f24ad38d1",
      purpose: UploadPurpose.PROPOSAL,
      status: UploadSessionStatus.OPEN,
      expiresAt: new Date("2026-07-26T11:00:00.000Z"),
      expiresInMinutes: 15,
      uploads: [],
    });

    await createProposalUploadUrl(
      {
        idempotencyKey: "9225cf33-3e23-48c5-8874-c03d942b0aad",
        files: [
          { fileName: "proposal.pdf", mimeType: "application/pdf", sizeBytes: 100 },
          { fileName: "appendix.zip", mimeType: "application/zip", sizeBytes: 200 },
        ],
      },
      auth,
    );

    expect(createStagedUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: UploadPurpose.PROPOSAL,
        files: expect.arrayContaining([
          expect.objectContaining({ fileName: "proposal.pdf" }),
          expect.objectContaining({ fileName: "appendix.zip" }),
        ]),
      }),
      auth,
      "student-1",
    );
  });

  it("finalizes all verified files into one current logical version", async () => {
    mockEligibleStudent([{ id: "assignment-1" }]);
    vi.mocked(verifyUploadSessionForFinalize).mockResolvedValue({
      state: "VERIFIED",
      session: {
        id: "f7697667-a155-4a45-aa8a-172f24ad38d1",
        manifestHash: "manifest-sha256",
        files: [
          {
            id: "staged-1",
            ordinal: 0,
            fileName: "proposal.pdf",
            storagePath: "proposals/student-1/staged/session/file/proposal.pdf",
            mimeType: "application/pdf",
            sizeBytes: 100,
            checksumSha256: "a".repeat(64),
          },
          {
            id: "staged-2",
            ordinal: 1,
            fileName: "appendix.zip",
            storagePath: "proposals/student-1/staged/session/file/appendix.zip",
            mimeType: "application/zip",
            sizeBytes: 200,
            checksumSha256: "b".repeat(64),
          },
        ],
      },
    });

    let proposalVersionCreate = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      proposalVersionCreate = vi.fn().mockResolvedValue({ id: "version-1" });
      const tx = {
        researchProposal: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "proposal-1",
            status: ProposalStatus.UNDER_REVIEW,
          }),
          update: vi.fn().mockResolvedValue({ id: "proposal-1" }),
        },
        proposalVersion: {
          aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: null } }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: proposalVersionCreate,
        },
        document: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        stagedUploadFile: {
          update: vi.fn().mockResolvedValue({}),
        },
        uploadSession: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as never);
    });
    vi.mocked(prisma.researchProposal.findUnique).mockResolvedValue({
      id: "proposal-1",
      title: "Adaptive Thesis Supervision",
      abstract: "A complete proposal package.",
      status: ProposalStatus.UNDER_REVIEW,
      currentVersion: 1,
      applicationId: "application-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      documents: [
        {
          id: "doc-1",
          fileName: "proposal.pdf",
          storagePath: "proposals/student-1/staged/session/file/proposal.pdf",
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date(),
        },
        {
          id: "doc-2",
          fileName: "appendix.zip",
          storagePath: "proposals/student-1/staged/session/file/appendix.zip",
          mimeType: "application/zip",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date(),
        },
      ],
    } as never);

    const proposal = await submitResearchProposal(
      {
        title: "Adaptive Thesis Supervision",
        abstract: "A complete proposal package.",
        uploadSessionId: "f7697667-a155-4a45-aa8a-172f24ad38d1",
      },
      auth,
    );

    expect(proposal.currentVersion).toBe(1);
    expect(proposal.documents).toHaveLength(2);
    expect(proposalVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isCurrent: true,
          manifestHash: "manifest-sha256",
          documents: {
            create: expect.arrayContaining([
              expect.objectContaining({ fileName: "proposal.pdf", version: 1 }),
              expect.objectContaining({ fileName: "appendix.zip", version: 1 }),
            ]),
          },
        }),
      }),
    );
  });
});
