import { ProposalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    supervisor: {
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

import { notifyProposalEvaluationSubmittedToAdministrator } from "@/lib/email";
import {
  createProposalEvaluation,
  ProposalEvaluationError,
} from "@/lib/proposals/evaluations";
import { prisma } from "@/lib/prisma/client";

describe("proposal evaluation integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a supervisor from evaluating a student they are not assigned to", async () => {
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "user-supervisor-1",
      user: {
        id: "user-supervisor-1",
        displayName: "Supervisor One",
        email: "supervisor1@example.com",
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
            supervisorUserId: "user-supervisor-2",
          },
        ],
      },
      evaluations: [],
    } as never);

    await expect(
      createProposalEvaluation(
        "proposal-1",
        {
          numericalScore: 82,
          feedback:
            "This proposal shows good potential, but the methodology still needs refinement and clearer milestones.",
        },
        {
          uid: "firebase-supervisor-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          role: "SUPERVISOR",
          email: "supervisor1@example.com",
        },
      ),
    ).rejects.toMatchObject<ProposalEvaluationError>({
      status: 403,
      message: "You can only evaluate proposals for students assigned to you.",
    });
  });

  it("notifies administrators after a supervisor submits an evaluation", async () => {
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "user-supervisor-1",
      user: {
        id: "user-supervisor-1",
        displayName: "Supervisor One",
        email: "supervisor1@example.com",
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
            supervisorId: "supervisor-1",
            supervisorUserId: "user-supervisor-1",
          },
        ],
      },
      evaluations: [],
    } as never);
    vi.mocked(prisma.evaluationForm.create).mockResolvedValue({
      id: "evaluation-1",
      numericalScore: 88,
      feedback:
        "The problem definition is strong and the research plan is feasible, with only moderate clarification needed.",
      submissionDate: new Date("2026-04-30T14:00:00.000Z"),
      supervisor: {
        id: "supervisor-1",
        user: {
          id: "user-supervisor-1",
          displayName: "Supervisor One",
          email: "supervisor1@example.com",
        },
      },
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
        numericalScore: 88,
        feedback:
          "The problem definition is strong and the research plan is feasible, with only moderate clarification needed.",
      },
      {
        uid: "firebase-supervisor-1",
        userId: "user-supervisor-1",
        firebaseUid: "firebase-supervisor-1",
        role: "SUPERVISOR",
        email: "supervisor1@example.com",
      },
    );

    expect(result.aggregate).toMatchObject({
      evaluationCount: 1,
      averageScore: 88,
    });
    expect(notifyProposalEvaluationSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "admin-1",
        administratorName: "Admin One",
        supervisorName: "Supervisor One",
        studentName: "Student One",
        proposalTitle: "Proposal One",
        numericalScore: 88,
      }),
    );
  });
});
