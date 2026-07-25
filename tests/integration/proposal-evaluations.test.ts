import { ProposalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    examiner: {
      findUnique: vi.fn(),
    },
    researchProposal: {
      findUnique: vi.fn(),
    },
    evaluationForm: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

import { notify } from "@/lib/notifications";
import { createProposalEvaluation } from "@/lib/proposals/evaluations";
import { prisma } from "@/lib/prisma/client";

describe("proposal evaluation integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks an examiner from reviewing a student they supervise", async () => {
    vi.mocked(prisma.examiner.findUnique).mockResolvedValue({
      id: "examiner-1",
      userId: "user-supervisor-1",
      user: {
        id: "user-supervisor-1",
        displayName: "Examiner One",
        email: "examiner1@example.com",
      },
    } as never);
    vi.mocked(prisma.researchProposal.findUnique).mockResolvedValue({
      id: "proposal-1",
      title: "Proposal One",
      status: ProposalStatus.UNDER_REVIEW,
      studentId: "student-1",
      student: {
        id: "student-1",
        user: {
          id: "user-student-1",
          displayName: "Student One",
          email: "student1@example.com",
        },
        supervisorAssignments: [
          {
            supervisorId: "supervisor-2",
            supervisorUserId: "user-supervisor-1",
          },
        ],
      },
      evaluations: [],
      versions: [
        {
          id: "proposal-version-1",
          manifestHash: "manifest-1",
        },
      ],
    } as never);

    await expect(
      createProposalEvaluation(
        "proposal-1",
        {
          feedback: "This proposal needs a clearer methodology.",
          documents: [],
        },
        {
          uid: "firebase-examiner-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-examiner-1",
          role: "EXAMINER",
          email: "examiner1@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "Assigned supervisors cannot review the same student's proposal.",
    });
  });

  it("notifies administrators after an examiner submits a textual review", async () => {
    vi.mocked(prisma.examiner.findUnique).mockResolvedValue({
      id: "examiner-1",
      userId: "user-examiner-1",
      user: {
        id: "user-examiner-1",
        displayName: "Examiner One",
        email: "examiner1@example.com",
      },
    } as never);
    vi.mocked(prisma.researchProposal.findUnique).mockResolvedValue({
      id: "proposal-1",
      title: "Proposal One",
      status: ProposalStatus.UNDER_REVIEW,
      studentId: "student-1",
      student: {
        id: "student-1",
        user: {
          id: "user-student-1",
          displayName: "Student One",
          email: "student1@example.com",
        },
        supervisorAssignments: [],
      },
      evaluations: [],
      versions: [
        {
          id: "proposal-version-1",
          manifestHash: "manifest-1",
        },
      ],
    } as never);
    vi.mocked(prisma.evaluationForm.create).mockResolvedValue({
      id: "evaluation-1",
      feedback:
        "The problem definition is strong and the research plan is feasible, with only moderate clarification needed.",
      adminComments: null,
      releasedAt: null,
      submissionDate: new Date("2026-04-30T14:00:00.000Z"),
      examiner: {
        id: "examiner-1",
        user: {
          id: "user-examiner-1",
          displayName: "Examiner One",
          email: "examiner1@example.com",
        },
      },
      documents: [],
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "admin-1",
        displayName: "Admin One",
        email: "admin1@example.com",
      },
    ] as never);

    const result = await createProposalEvaluation(
      "proposal-1",
      {
        feedback:
          "The problem definition is strong and the research plan is feasible, with only moderate clarification needed.",
        documents: [],
      },
      {
        uid: "firebase-examiner-1",
        userId: "user-examiner-1",
        firebaseUid: "firebase-examiner-1",
        role: "EXAMINER",
        email: "examiner1@example.com",
      },
    );

    expect(result.aggregate).toMatchObject({
      evaluationCount: 1,
      reviewCount: 1,
      averageScore: null,
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "EXAMINER_REVIEW_SUBMITTED",
        recipientUserId: "admin-1",
        administratorName: "Admin One",
        examinerName: "Examiner One",
        studentName: "Student One",
        subjectTitle: "Proposal One",
        reviewKind: "proposal",
      }),
    );
  });
});
