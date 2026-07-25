import { ProposalStatus } from "@prisma/client";
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
    researchProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    student: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  proposalSubmissionSchema,
  proposalUploadRequestSchema,
  updateResearchProposalStatus,
} from "@/lib/proposals/submission";
import { prisma } from "@/lib/prisma/client";

describe("proposal submission contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts 1–10 files in a staged upload request", () => {
    const result = proposalUploadRequestSchema.safeParse({
      idempotencyKey: "4cd46f67-0471-4fc4-9324-e9f6a034c192",
      files: ["proposal.pdf", "appendix.zip"].map((fileName) => ({
        fileName,
        mimeType: fileName.endsWith(".pdf")
          ? "application/pdf"
          : "application/zip",
        sizeBytes: 2048,
      })),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a submission that is not bound to a staged session", () => {
    const result = proposalSubmissionSchema.safeParse({
      title: "Adaptive Thesis Supervision",
      abstract: "A complete proposal submission.",
    });
    expect(result.success).toBe(false);
  });

  it("allows only an administrator to approve a proposal", async () => {
    await expect(
      updateResearchProposalStatus(
        "proposal-1",
        { status: ProposalStatus.APPROVED },
        {
          uid: "firebase-student-1",
          userId: "user-student-1",
          firebaseUid: "firebase-student-1",
          role: "STUDENT",
          email: "student@example.com",
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.researchProposal.findUnique).not.toHaveBeenCalled();
  });
});
