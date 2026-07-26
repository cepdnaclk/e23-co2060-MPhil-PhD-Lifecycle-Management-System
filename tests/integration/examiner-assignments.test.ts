import { AssignmentStatus, ReadinessDecision, ThesisStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyExaminerAssignedToThesis: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");

  return {
    ...actual,
    generateDownloadSignedUrl: vi.fn().mockResolvedValue(
      "https://storage.example.test/read?path=theses%2Fstudent-1%2Fthesis.pdf",
    ),
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    administrator: {
      findUnique: vi.fn(),
    },
    examiner: {
      findUnique: vi.fn(),
    },
    thesis: {
      findUnique: vi.fn(),
    },
    thesisExaminerAssignment: {
      create: vi.fn(),
    },
    lifecycleAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/documents", () => ({
  getDocumentDownloadUrl: vi.fn().mockResolvedValue(
    "https://storage.example.test/read?path=theses%2Fstudent-1%2Fthesis.pdf",
  ),
}));

import { assignExaminerToThesis } from "@/lib/assignments/examiners";
import { prisma } from "@/lib/prisma/client";

describe("examiner assignment integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        thesisExaminerAssignment: prisma.thesisExaminerAssignment,
        lifecycleAuditEvent: prisma.lifecycleAuditEvent,
      } as never),
    );
  });

  it("creates a pending assignment without disclosing the thesis before HOD confirmation", async () => {
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
      user: {
        displayName: "Admin One",
      },
    } as never);
    vi.mocked(prisma.examiner.findUnique).mockResolvedValue({
      id: "examiner-1",
      userId: "user-examiner-1",
      user: {
        id: "user-examiner-1",
        displayName: "Examiner One",
        email: "examiner1@example.com",
        isActive: true,
      },
    } as never);
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      title: "Adaptive Systems Thesis",
      status: ThesisStatus.SUBMITTED,
      studentId: "student-1",
      student: {
        id: "student-1",
        user: {
          id: "user-student-1",
          displayName: "Student One",
          email: "student@example.com",
        },
        supervisorAssignments: [],
      },
      examinerAssignments: [],
      readinessCertification: { decision: ReadinessDecision.CERTIFIED },
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
      versions: [
        {
          id: "thesis-version-1",
          manifestHash: "manifest-1",
          isCurrent: true,
        },
      ],
    } as never);
    vi.mocked(prisma.thesisExaminerAssignment.create).mockResolvedValue({
      id: "assignment-1",
      thesisId: "thesis-1",
      studentId: "student-1",
      examinerId: "examiner-1",
      examinerUserId: "user-examiner-1",
      assignedAt: new Date("2026-05-01T04:05:00.000Z"),
      assignedBy: "admin-1",
      status: AssignmentStatus.PENDING,
    } as never);

    const result = await assignExaminerToThesis(
      {
        thesisId: "thesis-1",
        examinerId: "examiner-1",
      },
      {
        uid: "firebase-admin-1",
        userId: "user-admin-1",
        firebaseUid: "firebase-admin-1",
        role: "ADMINISTRATOR",
        email: "admin@example.com",
      },
    );

    expect(result).toMatchObject({
      awaitingHodConfirmation: true,
      assignment: { status: AssignmentStatus.PENDING },
    });
    expect(prisma.lifecycleAuditEvent.create).toHaveBeenCalled();
  });
});
