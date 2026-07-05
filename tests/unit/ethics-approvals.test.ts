import { DocumentType, EthicsApprovalStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    ethicsApproval: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    administrator: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();

  return {
    ...actual,
    generateUploadSignedUrl: vi.fn().mockResolvedValue("https://storage.test/upload"),
  };
});

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyInBackground: vi.fn(),
}));

import {
  createEthicsApprovalUploadUrl,
  EthicsApprovalError,
  submitEthicsApproval,
  updateEthicsApprovalDecision,
} from "@/lib/ethics/approvals";
import { notify, notifyInBackground } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import { generateUploadSignedUrl } from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

const studentAuth: AuthenticatedUserContext = {
  uid: "firebase-student-1",
  userId: "user-student-1",
  firebaseUid: "firebase-student-1",
  role: UserRole.STUDENT,
};

const adminAuth: AuthenticatedUserContext = {
  uid: "firebase-admin-1",
  userId: "user-admin-1",
  firebaseUid: "firebase-admin-1",
  role: UserRole.ADMINISTRATOR,
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

function makeApproval(status = EthicsApprovalStatus.SUBMITTED) {
  return {
    id: "approval-1",
    studentId: "student-1",
    title: "Participant interview ethics",
    summary: "Ethics evidence summary for participant interview data collection.",
    status,
    reviewNotes: null,
    reviewedAt: null,
    reviewedById: null,
    isArchived: false,
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    updatedAt: new Date("2026-07-01T08:00:00.000Z"),
    documents: [
      {
        id: "doc-1",
        fileName: "ethics.pdf",
        storagePath: "ethics-approvals/student-1/approval-1/ethics.pdf",
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
    reviewedBy: null,
  };
}

describe("ethics approval workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "approval-1" as `${string}-${string}-${string}-${string}-${string}`,
    );
  });

  it("creates upload URLs under the ethics approval storage root", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext() as never,
    );

    const result = await createEthicsApprovalUploadUrl(
      {
        fileName: "ethics.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 1024,
      },
      studentAuth,
    );

    expect(result).toMatchObject({
      approvalId: "approval-1",
      storagePath: "ethics-approvals/student-1/approval-1/ethics.pdf",
      signedUrl: "https://storage.test/upload",
    });
    expect(generateUploadSignedUrl).toHaveBeenCalledWith(
      "ethics-approvals/student-1/approval-1/ethics.pdf",
      "application/pdf",
    );
  });

  it("blocks ethics submission until the proposal is approved", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext({ researchProposals: [] }) as never,
    );

    await expect(
      createEthicsApprovalUploadUrl(
        {
          fileName: "ethics.pdf",
          contentType: "application/pdf",
          fileSizeBytes: 1024,
        },
        studentAuth,
      ),
    ).rejects.toMatchObject({
      message: "Your proposal must be approved before submitting ethics approval.",
    });
  });

  it("creates an ethics approval record and linked document", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      makeStudentContext() as never,
    );
    vi.mocked(prisma.ethicsApproval.create).mockResolvedValue(
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
        document: {
          fileName: "ethics.pdf",
          storagePath: "ethics-approvals/student-1/approval-1/ethics.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      },
      studentAuth,
    );

    expect(approval.status).toBe(EthicsApprovalStatus.SUBMITTED);
    expect(prisma.ethicsApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "approval-1",
          documents: {
            create: expect.objectContaining({
              documentType: DocumentType.ETHICS_APPROVAL,
              storagePath: "ethics-approvals/student-1/approval-1/ethics.pdf",
            }),
          },
        }),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ETHICS_APPROVAL_SUBMITTED",
        recipientUserId: "user-admin-1",
      }),
    );
  });

  it("records admin decisions and notifies the student", async () => {
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
    } as never);
    vi.mocked(prisma.ethicsApproval.findUnique).mockResolvedValue(
      makeApproval(EthicsApprovalStatus.UNDER_REVIEW) as never,
    );
    vi.mocked(prisma.ethicsApproval.update).mockResolvedValue(
      {
        ...makeApproval(EthicsApprovalStatus.APPROVED),
        reviewNotes: "Approved by committee.",
        reviewedAt: new Date("2026-07-02T08:00:00.000Z"),
        reviewedById: "admin-1",
      } as never,
    );

    const approval = await updateEthicsApprovalDecision(
      "approval-1",
      {
        status: EthicsApprovalStatus.APPROVED,
        reviewNotes: "Approved by committee.",
      },
      adminAuth,
    );

    expect(approval.status).toBe(EthicsApprovalStatus.APPROVED);
    expect(prisma.ethicsApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EthicsApprovalStatus.APPROVED,
          reviewNotes: "Approved by committee.",
          reviewedById: "admin-1",
        }),
      }),
    );
    expect(notifyInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ETHICS_APPROVAL_STATUS_CHANGED",
        recipientUserId: "user-student-1",
        statusLabel: EthicsApprovalStatus.APPROVED,
      }),
    );
  });

  it("keeps approved ethics records immutable", async () => {
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
    } as never);
    vi.mocked(prisma.ethicsApproval.findUnique).mockResolvedValue(
      makeApproval(EthicsApprovalStatus.APPROVED) as never,
    );

    await expect(
      updateEthicsApprovalDecision(
        "approval-1",
        {
          status: EthicsApprovalStatus.REJECTED,
          reviewNotes: "Undo approval.",
        },
        adminAuth,
      ),
    ).rejects.toBeInstanceOf(EthicsApprovalError);
  });
});
