import { DocumentType, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    ethicsApproval: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    administrator: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/uploads/sessions", () => ({
  createStagedUploadSession: vi.fn(),
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    status = 409;
  },
}));

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyInBackground: vi.fn(),
}));

import {
  createEthicsApprovalUploadUrl,
  listEthicsApprovals,
  submitEthicsApproval,
} from "@/lib/ethics/approvals";
import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import {
  createStagedUploadSession,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

const studentAuth: AuthenticatedUserContext = {
  uid: "firebase-student-1",
  userId: "user-student-1",
  firebaseUid: "firebase-student-1",
  role: UserRole.STUDENT,
};

function makeStudentContext(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    user: {
      id: "user-student-1",
      displayName: "Student One",
      email: "student@example.com",
    },
    registrations: [{ id: "registration-1" }],
    researchProposals: [{ id: "proposal-1" }],
    ethicsApprovals: [],
    ...overrides,
  };
}

function makeApproval() {
  return {
    id: "approval-1",
    studentId: "student-1",
    title: "Participant interview ethics",
    summary: "Ethics evidence summary for participant interview data collection.",
    applicability: "REQUIRED",
    status: "APPROVED",
    referenceNumber: "ERC/2026/014",
    validUntil: null,
    notes: null,
    isArchived: false,
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    updatedAt: new Date("2026-07-01T08:00:00.000Z"),
    documents: [
      {
        id: "doc-1",
        fileName: "ethics.pdf",
        storagePath:
          "ethics-approvals/student-1/staged/session-1/file-1/ethics.pdf",
        mimeType: "application/pdf",
        version: 1,
        isCurrentVersion: true,
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
      },
    ],
    student: {
      id: "student-1",
      programType: "PHD",
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student@example.com",
      },
    },
  };
}

describe("ethics approval workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "approval-1" as `${string}-${string}-${string}-${string}-${string}`,
    );
  });

  it("creates a sealed staged upload session", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext() as never,
    );
    vi.mocked(createStagedUploadSession).mockResolvedValue({
      uploadSessionId: "session-1",
      uploads: [{ signedUrl: "https://storage.test/upload" }],
    } as never);

    await expect(
      createEthicsApprovalUploadUrl(
        {
          idempotencyKey: "72910895-0d9f-4f2a-a0d9-c4998b7f0228",
          files: [
            {
              fileName: "ethics.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
            },
          ],
        },
        studentAuth,
      ),
    ).resolves.toMatchObject({ uploadSessionId: "session-1" });

    expect(createStagedUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "ETHICS_APPROVAL" }),
      studentAuth,
      "student-1",
    );
  });

  it("blocks ethics uploads until the proposal is approved", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext({ researchProposals: [] }) as never,
    );

    await expect(
      createEthicsApprovalUploadUrl(
        {
          idempotencyKey: "72910895-0d9f-4f2a-a0d9-c4998b7f0228",
          files: [
            {
              fileName: "ethics.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024,
            },
          ],
        },
        studentAuth,
      ),
    ).rejects.toMatchObject({
      message: "Your proposal must be approved before submitting ethics documents.",
    });
  });

  it("finalizes verified bytes and then notifies administrators", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext() as never,
    );
    vi.mocked(verifyUploadSessionForFinalize).mockResolvedValue({
      state: "VERIFIED",
      session: {
        id: "d8e54622-7149-49e8-95d8-37d2d6206db5",
        manifestHash: "manifest-1",
        files: [
          {
            id: "staged-1",
            ordinal: 0,
            fileName: "ethics.pdf",
            storagePath:
              "ethics-approvals/student-1/staged/session-1/file-1/ethics.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            checksumSha256: "a".repeat(64),
          },
        ],
      },
    } as never);
    const ethicsApprovalCreate = vi.fn().mockResolvedValue({ id: "approval-1" });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        ethicsApproval: { create: ethicsApprovalCreate },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
      } as never),
    );
    vi.mocked(prisma.ethicsApproval.findUnique).mockResolvedValue(
      makeApproval() as never,
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "user-admin-1",
        displayName: "Admin One",
        email: "admin@example.com",
      },
    ] as never);

    const approval = await submitEthicsApproval(
      {
        title: "Participant interview ethics",
        summary: "Ethics evidence summary for participant interview data collection.",
        uploadSessionId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      },
      studentAuth,
    );

    expect(ethicsApprovalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documents: {
            create: [
              expect.objectContaining({
                documentType: DocumentType.ETHICS_APPROVAL,
                verificationStatus: "VERIFIED",
              }),
            ],
          },
        }),
      }),
    );
    expect(approval.documents).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ETHICS_APPROVAL_SUBMITTED",
        recipientUserId: "user-admin-1",
      }),
    );
  });

  it("exposes Department applicability and status in the admin list", async () => {
    vi.mocked(prisma.ethicsApproval.findMany).mockResolvedValue([
      makeApproval(),
    ] as never);

    await expect(listEthicsApprovals()).resolves.toEqual([
      expect.objectContaining({
        applicability: "REQUIRED",
        status: "APPROVED",
        referenceNumber: "ERC/2026/014",
      }),
    ]);
  });
});
