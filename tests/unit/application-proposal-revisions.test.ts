import {
  ApplicationStatus,
  DepartmentDecision,
  DocumentType,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/uploads/capabilities", () => ({
  requirePublicApplicationDraft: vi.fn(),
  PublicDraftCapabilityError: class PublicDraftCapabilityError extends Error {
    status = 403;
  },
}));

vi.mock("@/lib/uploads/verification", () => ({
  verifyStagedUploadFile: vi.fn(),
  UploadVerificationError: class UploadVerificationError extends Error {},
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    uploadSession: { updateMany: vi.fn() },
    stagedUploadFile: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { submitApplicationProposalRevision } from "@/lib/applications/proposal-revisions";
import { prisma } from "@/lib/prisma/client";
import { requirePublicApplicationDraft } from "@/lib/uploads/capabilities";
import { verifyStagedUploadFile } from "@/lib/uploads/verification";

const revisionToken = "revision-capability-token-with-at-least-32-bytes";
const draftId = "d8e54622-7149-49e8-95d8-37d2d6206db5";
const input = {
  revisionToken,
  draftId,
  draftToken: "draft-capability-token-with-at-least-32-bytes",
  title: "Revised adaptive systems proposal",
  abstract:
    "This revised abstract explains the updated method, evidence, and research contribution.",
  changeSummary: "Clarified the method and expanded the validation plan.",
};

function applicationRecord(token = revisionToken) {
  return {
    id: "application-1",
    applicantEmail: "applicant@example.com",
    departmentDecision: DepartmentDecision.REVISION_REQUIRED,
    status: ApplicationStatus.UNDER_REVIEW,
    revisionCapabilityTokenHash: createHash("sha256")
      .update(token)
      .digest("hex"),
    revisionCapabilityExpiresAt: new Date(Date.now() + 60_000),
    proposalVersions: [
      {
        id: "proposal-version-1",
        versionNumber: 1,
        reviewerAssignments: [
          {
            reviewerUserId: "reviewer-1",
            assignedByUserId: "admin-user-1",
          },
          {
            reviewerUserId: "reviewer-2",
            assignedByUserId: "admin-user-1",
          },
        ],
      },
    ],
  };
}

describe("application proposal revision capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a guessed revision capability before accessing an upload draft", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue(
      applicationRecord("different-token-with-at-least-thirty-two-bytes") as never,
    );

    await expect(
      submitApplicationProposalRevision("application-1", input),
    ).rejects.toMatchObject({
      status: 403,
      message: "The proposal revision capability is invalid.",
    });
    expect(requirePublicApplicationDraft).not.toHaveBeenCalled();
  });

  it("creates a new exact proposal version, binds evidence, and reassigns reviewers", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue(
      applicationRecord() as never,
    );
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: draftId,
      files: [
        {
          id: "staged-1",
          fileName: "proposal-v2.pdf",
          storagePath:
            "applications/revision/staged/session/file/proposal-v2.pdf",
        },
      ],
    } as never);
    vi.mocked(prisma.uploadSession.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(verifyStagedUploadFile).mockResolvedValue({
      id: "staged-1",
      ordinal: 0,
      fileName: "proposal-v2.pdf",
      storagePath:
        "applications/revision/staged/session/file/proposal-v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_048,
      checksumSha256: "b".repeat(64),
    });

    const versionCreate = vi.fn().mockImplementation(({ data }) => ({
      id: data.id,
      versionNumber: data.versionNumber,
    }));
    const reviewerCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const applicationUpdate = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        applicationProposalVersion: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: versionCreate,
        },
        document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        proposalReviewerAssignment: { createMany: reviewerCreateMany },
        application: { update: applicationUpdate },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
        lifecycleAuditEvent: { create: vi.fn().mockResolvedValue({}) },
        outboxMessage: { create: vi.fn().mockResolvedValue({}) },
      } as never),
    );

    await expect(
      submitApplicationProposalRevision("application-1", input),
    ).resolves.toMatchObject({ versionNumber: 2 });

    expect(versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: "application-1",
        versionNumber: 2,
        isCurrent: true,
        documents: {
          create: [
            expect.objectContaining({
              documentType: DocumentType.PROPOSAL,
              checksumSha256: "b".repeat(64),
            }),
          ],
        },
      }),
    });
    expect(reviewerCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          proposalVersionId: expect.any(String),
          reviewerUserId: "reviewer-1",
          assignedByUserId: "admin-user-1",
        }),
        expect.objectContaining({
          proposalVersionId: expect.any(String),
          reviewerUserId: "reviewer-2",
          assignedByUserId: "admin-user-1",
        }),
      ],
    });
    expect(applicationUpdate).toHaveBeenCalledWith({
      where: { id: "application-1" },
      data: expect.objectContaining({
        departmentDecision: DepartmentDecision.PENDING,
        revisionCapabilityTokenHash: null,
        revisionCapabilityExpiresAt: null,
      }),
    });
  });
});
