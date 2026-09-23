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

  it("blocks roles that cannot submit proposal reviews", async () => {
    await expect(
      createProposalEvaluation(
        "proposal-1",
        {
          feedback: "Text review.",
          documents: [],
        },
        {
          uid: "firebase-hod-1",
          userId: "user-hod-1",
          firebaseUid: "firebase-hod-1",
          role: "HOD",
          email: "hod@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "Only examiners or supervisors can submit proposal evaluations.",
    });
  });
});
