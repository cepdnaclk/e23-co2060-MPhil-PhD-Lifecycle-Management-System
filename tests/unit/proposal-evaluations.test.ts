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

import {
  createProposalEvaluation,
  proposalEvaluationSchema,
} from "@/lib/proposals/evaluations";

describe("proposal evaluation utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts textual feedback without any score field", () => {
    const result = proposalEvaluationSchema.safeParse({
      feedback: "Text review only.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feedback).toBe("Text review only.");
    }
  });

  it("blocks supervisors from submitting proposal reviews", async () => {
    await expect(
      createProposalEvaluation(
        "proposal-1",
        {
          feedback: "Text review.",
          documents: [],
        },
        {
          uid: "firebase-supervisor-1",
          userId: "user-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          role: "SUPERVISOR",
          email: "supervisor@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "Only examiners can submit proposal reviews.",
    });
  });
});
