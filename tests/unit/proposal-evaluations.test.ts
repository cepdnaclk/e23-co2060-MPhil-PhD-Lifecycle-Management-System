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

import {
  createProposalEvaluation,
  proposalEvaluationSchema,
  ProposalEvaluationError,
} from "@/lib/proposals/evaluations";

describe("proposal evaluation utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects scores outside the 0-100 range", () => {
    const result = proposalEvaluationSchema.safeParse({
      numericalScore: 101,
      feedback:
        "This feedback is deliberately long enough to pass the minimum length rule.",
    });

    expect(result.success).toBe(false);
  });

  it("returns a 400 error when feedback is shorter than 50 characters", async () => {
    await expect(
      createProposalEvaluation(
        "proposal-1",
        {
          numericalScore: 70,
          feedback: "Too short for the validation rule.",
        },
        {
          uid: "firebase-supervisor-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          role: "SUPERVISOR",
          email: "supervisor@example.com",
        },
      ),
    ).rejects.toMatchObject<ProposalEvaluationError>({
      status: 400,
      message: "Feedback must be at least 50 characters long.",
    });
  });
});
