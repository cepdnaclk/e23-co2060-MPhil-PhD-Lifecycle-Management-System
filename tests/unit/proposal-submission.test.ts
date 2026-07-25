import { ProposalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalStatusChange: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    researchProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  proposalSubmissionSchema,
  submitResearchProposal,
  updateResearchProposalStatus,
} from "@/lib/proposals/submission";
import { prisma } from "@/lib/prisma/client";

describe("proposal submission utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-PDF proposal document via the Zod schema", () => {
    const result = proposalSubmissionSchema.safeParse({
      title: "Adaptive Thesis Supervision",
      abstract:
        "This proposal studies decision-support patterns for postgraduate supervision workflows.",
      document: {
        fileName: "proposal.docx",
        storagePath: "proposals/student-1/1/proposal.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 2048,
      },
    });

    expect(result.success).toBe(false);
  });

  it("temporarily rejects more than one proposal document before persistence", async () => {
    const documents = ["proposal.pdf", "appendix.zip"].map((fileName) => ({
      fileName,
      storagePath: `proposals/student-1/1/${fileName}`,
      mimeType: fileName.endsWith(".pdf")
        ? ("application/pdf" as const)
        : ("application/zip" as const),
      sizeBytes: 2048,
    }));
    const parsed = proposalSubmissionSchema.safeParse({
      title: "Adaptive Thesis Supervision",
      abstract: "A complete proposal submission.",
      documents,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Upload one proposal document per submission.",
      );
    }

    await expect(
      submitResearchProposal(
        {
          title: "Adaptive Thesis Supervision",
          abstract: "A complete proposal submission.",
          documents,
        },
        {
          uid: "firebase-student-1",
          userId: "user-student-1",
          firebaseUid: "firebase-student-1",
          role: "STUDENT",
          email: "student@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Upload one proposal document per submission.",
    });
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a payload that supplies both legacy and array document fields", () => {
    const result = proposalSubmissionSchema.safeParse({
      title: "Adaptive Thesis Supervision",
      abstract: "A complete proposal submission.",
      document: {
        fileName: "legacy.pdf",
        storagePath: "proposals/student-1/1/legacy.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
      documents: [
        {
          fileName: "proposal.pdf",
          storagePath: "proposals/student-1/1/proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Upload exactly one proposal document.",
      );
    }
  });

  it("allows only an Administrator to transition a proposal to APPROVED", async () => {
    const promise = updateResearchProposalStatus(
      "proposal-1",
      {
        status: ProposalStatus.APPROVED,
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    await expect(promise).rejects.toMatchObject({
      status: 403,
    });
    await expect(promise).rejects.toThrow(
      /Only administrators can update the proposal status\./,
    );

    expect(prisma.researchProposal.findUnique).not.toHaveBeenCalled();
  });

  it("keeps a new proposal in SUBMITTED when no supervisors are assigned yet", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
      },
      registrations: [{ id: "registration-1" }],
      supervisorAssignments: [],
      application: {
        id: "application-1",
        status: "ADMITTED",
        researchProposal: null,
      },
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        researchProposal: {
          create: vi.fn().mockResolvedValue({
            id: "proposal-1",
            title: "New Proposal",
            abstract:
              "A first submission outlining the thesis direction, problem, and research method.",
            status: ProposalStatus.SUBMITTED,
            currentVersion: 1,
            applicationId: "application-1",
            createdAt: new Date("2026-04-30T09:00:00.000Z"),
            updatedAt: new Date("2026-04-30T09:00:00.000Z"),
            documents: [],
          }),
        },
      };

      const result = await callback(tx as never);
      expect(tx.researchProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProposalStatus.SUBMITTED,
          }),
        }),
      );
      return result;
    });

    const proposal = await submitResearchProposal(
      {
        title: "New Proposal",
        abstract:
          "A first submission outlining the thesis direction, problem, and research method.",
        document: {
          fileName: "proposal.pdf",
          storagePath: "proposals/student-1/1/proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student@example.com",
      },
    );

    expect(proposal.status).toBe(ProposalStatus.SUBMITTED);
  });
});
