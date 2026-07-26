import {
  CorrectionOrderStatus,
  CorrectionReviewDecision,
  CorrectionReviewStage,
  CorrectionType,
  DocumentType,
  ExaminerRecommendation,
  ThesisStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
    correctionOrder: { findUnique: vi.fn() },
    correctionSubmission: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/audit/lifecycle", () => ({
  appendLifecycleEventAndEnqueue: vi.fn().mockResolvedValue({
    event: { id: "audit-1" },
    outboxMessages: [],
  }),
  LIFECYCLE_EVENT: {
    CORRECTIONS_ORDERED: "corrections.ordered",
    CORRECTIONS_SUBMITTED: "corrections.submitted",
    CORRECTIONS_SUPERVISOR_REVIEWED: "corrections.supervisor_reviewed",
    CORRECTIONS_EXAMINER_REVIEWED: "corrections.examiner_reviewed",
    CORRECTIONS_HOD_DECIDED: "corrections.hod_decided",
  },
}));

vi.mock("@/lib/uploads/sessions", () => ({
  createStagedUploadSession: vi.fn(),
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    status = 409 as const;
  },
}));

import {
  decideCorrectionCompletion,
  orderVivaCorrections,
  reviewCorrectionsByExaminer,
  reviewCorrectionsBySupervisor,
  submitOrderedCorrections,
} from "@/lib/completion/corrections-workflow";
import { prisma } from "@/lib/prisma/client";
import { verifyUploadSessionForFinalize } from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

const hodAuth: AuthenticatedUserContext = {
  uid: "firebase-hod",
  firebaseUid: "firebase-hod",
  userId: "user-hod",
  role: UserRole.HOD,
};

const studentAuth: AuthenticatedUserContext = {
  uid: "firebase-student",
  firebaseUid: "firebase-student",
  userId: "user-student",
  role: UserRole.STUDENT,
};

const supervisorAuth: AuthenticatedUserContext = {
  uid: "firebase-supervisor",
  firebaseUid: "firebase-supervisor",
  userId: "user-supervisor",
  role: UserRole.SUPERVISOR,
};

const examinerAuth: AuthenticatedUserContext = {
  uid: "firebase-examiner",
  firebaseUid: "firebase-examiner",
  userId: "user-examiner",
  role: UserRole.EXAMINER,
};

describe("version-bound correction workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds a major correction order to the current thesis version", async () => {
    const thesisUpdate = vi.fn().mockResolvedValue({});
    const correctionOrderCreate = vi.fn().mockResolvedValue({
      id: "order-1",
      status: CorrectionOrderStatus.ORDERED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        viva: {
          findUnique: vi.fn().mockResolvedValue({
            id: "viva-1",
            hodOutcome: ExaminerRecommendation.MAJOR_CORRECTIONS,
            correctionOrders: [],
            thesis: {
              id: "thesis-1",
              studentId: "student-1",
              student: {
                userId: "student-user-1",
                supervisorAssignments: [],
              },
              versions: [{ id: "thesis-version-3" }],
              examinerAssignments: [
                {
                  id: "assignment-1",
                  thesisVersionId: "thesis-version-3",
                },
              ],
            },
          }),
        },
        correctionOrder: { create: correctionOrderCreate },
        thesis: { update: thesisUpdate },
      } as never),
    );

    await orderVivaCorrections(
      "viva-1",
      {
        requirementType: CorrectionType.MAJOR,
        requirements:
          "Revise the analysis and submit a complete response to every item.",
      },
      hodAuth,
    );

    expect(correctionOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originatingThesisVersionId: "thesis-version-3",
          requiresExaminerReview: true,
        }),
      }),
    );
    expect(thesisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ThesisStatus.CORRECTIONS_REQUIRED },
      }),
    );
  });

  it("creates a verified correction version and exact revised thesis version", async () => {
    vi.mocked(prisma.correctionOrder.findUnique).mockResolvedValue({
      id: "order-1",
      thesisId: "thesis-1",
      status: CorrectionOrderStatus.ORDERED,
      thesis: {
        status: ThesisStatus.CORRECTIONS_REQUIRED,
        isArchived: false,
        student: {
          id: "student-1",
          userId: studentAuth.userId,
          isArchived: false,
        },
      },
    } as never);
    vi.mocked(verifyUploadSessionForFinalize).mockResolvedValue({
      state: "VERIFIED",
      session: {
        id: "upload-session-1",
        manifestHash: "manifest-1",
        files: [
          {
            id: "staged-1",
            fileName: "corrected-thesis.pdf",
            storagePath: "corrections/student-1/corrected-thesis.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            checksumSha256: "a".repeat(64),
          },
        ],
      },
    } as never);

    const documentCreate = vi.fn().mockResolvedValue({});
    const thesisVersionCreate = vi.fn().mockResolvedValue({});
    const correctionSubmissionCreate = vi.fn().mockResolvedValue({});
    const orderUpdate = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        correctionOrder: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            status: CorrectionOrderStatus.ORDERED,
            originatingThesisVersionId: "thesis-version-2",
            thesis: {
              id: "thesis-1",
              status: ThesisStatus.CORRECTIONS_REQUIRED,
              student: {
                id: "student-1",
                userId: studentAuth.userId,
                supervisorAssignments: [
                  { supervisorUserId: "user-supervisor" },
                ],
              },
            },
            submissions: [],
          }),
          update: orderUpdate,
        },
        thesisVersion: {
          aggregate: vi
            .fn()
            .mockResolvedValue({ _max: { versionNumber: 2 } }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: thesisVersionCreate,
        },
        correctionSubmission: { create: correctionSubmissionCreate },
        document: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: documentCreate,
        },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
      } as never),
    );
    vi.mocked(prisma.correctionSubmission.findUnique).mockResolvedValue({
      id: "submission-1",
      documents: [{ id: "document-1" }],
    } as never);

    const result = await submitOrderedCorrections(
      "order-1",
      {
        responseSummary:
          "Every ordered item is addressed in the corrected thesis and response.",
        uploadSessionId: "a43ab33b-d71a-44e7-a0be-e42e972d9f8a",
      },
      studentAuth,
    );

    expect(thesisVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionNumber: 3,
          isCurrent: true,
          manifestHash: "manifest-1",
        }),
      }),
    );
    expect(correctionSubmissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctionOrderId: "order-1",
          versionNumber: 1,
          manifestHash: "manifest-1",
        }),
      }),
    );
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentType: DocumentType.CORRECTION,
          correctionSubmissionId: expect.any(String),
          thesisVersionId: expect.any(String),
        }),
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CorrectionOrderStatus.SUBMITTED,
        }),
      }),
    );
    expect(result.documents).toHaveLength(1);
  });

  it("allows the active primary Supervisor to return the exact submission", async () => {
    const submissionUpdate = vi.fn().mockResolvedValue({});
    const orderUpdate = vi.fn().mockResolvedValue({
      status: CorrectionOrderStatus.RETURNED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        correctionOrder: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            status: CorrectionOrderStatus.SUBMITTED,
            requiresExaminerReview: false,
            originatingThesisVersionId: "thesis-version-1",
            thesis: {
              studentId: "student-1",
              student: {
                userId: "user-student",
                supervisorAssignments: [{ id: "assignment-1" }],
              },
              examinerAssignments: [],
            },
            submissions: [
              {
                id: "submission-1",
                versionNumber: 1,
                revisedThesisVersionId: "thesis-version-2",
                documents: [{ id: "document-1" }],
              },
            ],
          }),
          update: orderUpdate,
        },
        correctionReview: {
          create: vi.fn().mockResolvedValue({ id: "review-1" }),
        },
        correctionSubmission: { update: submissionUpdate },
      } as never),
    );

    await reviewCorrectionsBySupervisor(
      "order-1",
      { decision: "RETURN", notes: "Address the unresolved third item." },
      supervisorAuth,
    );

    expect(submissionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "submission-1" },
        data: expect.objectContaining({
          returnReason: "Address the unresolved third item.",
        }),
      }),
    );
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: CorrectionOrderStatus.RETURNED },
      }),
    );
  });

  it("does not let one Examiner block independent required approvals", async () => {
    const orderUpdate = vi.fn().mockResolvedValue({
      status: CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        correctionOrder: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            status: CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
            requiresExaminerReview: true,
            originatingThesisVersionId: "thesis-version-1",
            thesis: {
              studentId: "student-1",
              student: {
                userId: "user-student",
                supervisorAssignments: [],
              },
              examinerAssignments: [
                {
                  id: "assignment-1",
                  examinerUserId: examinerAuth.userId,
                  thesisVersionId: "thesis-version-1",
                },
                {
                  id: "assignment-2",
                  examinerUserId: "user-examiner-2",
                  thesisVersionId: "thesis-version-1",
                },
              ],
            },
            submissions: [
              {
                id: "submission-1",
                versionNumber: 1,
                reviews: [],
              },
            ],
          }),
          update: orderUpdate,
        },
        correctionReview: {
          create: vi.fn().mockResolvedValue({ id: "review-1" }),
        },
      } as never),
    );

    await reviewCorrectionsByExaminer(
      "order-1",
      { decision: "APPROVE", notes: "The assigned items are resolved." },
      examinerAuth,
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: CorrectionOrderStatus.SUPERVISOR_CERTIFIED },
      }),
    );
  });

  it("lets the HOD close only a fully certified, version-bound submission", async () => {
    const thesisUpdate = vi.fn().mockResolvedValue({});
    const orderUpdate = vi.fn().mockResolvedValue({
      status: CorrectionOrderStatus.COMPLETION_APPROVED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        correctionOrder: {
          findUnique: vi.fn().mockResolvedValue({
            id: "order-1",
            status: CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
            requiresExaminerReview: false,
            originatingThesisVersionId: "thesis-version-1",
            thesis: {
              id: "thesis-1",
              studentId: "student-1",
              student: {
                userId: "user-student",
                supervisorAssignments: [],
              },
              examinerAssignments: [],
            },
            submissions: [
              {
                id: "submission-1",
                versionNumber: 2,
                revisedThesisVersionId: "thesis-version-3",
                documents: [{ id: "document-1" }],
                reviews: [
                  {
                    stage: CorrectionReviewStage.SUPERVISOR,
                    decision: CorrectionReviewDecision.CERTIFIED,
                    thesisExaminerAssignmentId: null,
                  },
                ],
              },
            ],
          }),
          update: orderUpdate,
        },
        thesis: { update: thesisUpdate },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      } as never),
    );

    await decideCorrectionCompletion(
      "order-1",
      { decision: "APPROVE", notes: "All ordered corrections are complete." },
      hodAuth,
    );

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CorrectionOrderStatus.COMPLETION_APPROVED,
          completionApprovedBy: hodAuth.userId,
        }),
      }),
    );
    expect(thesisUpdate).toHaveBeenCalledWith({
      where: { id: "thesis-1" },
      data: { status: ThesisStatus.CORRECTIONS_APPROVED },
    });
  });
});
