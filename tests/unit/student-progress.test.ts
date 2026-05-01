import { ProgramType, ProposalStatus, ThesisStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  calculateStageCompletionPercentages,
  buildProgressStepper,
  determineCurrentMilestone,
  getEstimatedCompletionDate,
} from "@/lib/students/progress";

describe("student progress utilities", () => {
  it("handles zero submissions without inflating completion", () => {
    const progress = calculateStageCompletionPercentages({
      proposalStatus: null,
      thesisStatus: null,
      documents: [],
    });

    expect(progress.proposal.completionPercentage).toBe(0);
    expect(progress.ethics.completionPercentage).toBe(0);
    expect(progress.dataCollection.completionPercentage).toBe(0);
    expect(progress.thesis.completionPercentage).toBe(0);
  });

  it("updates currentMilestone when the current proposal version becomes approved", () => {
    const milestone = determineCurrentMilestone({
      proposalStatus: ProposalStatus.APPROVED,
      documents: [
        {
          id: "doc-1",
          documentType: "PROPOSAL",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date("2026-05-01T04:00:00.000Z"),
          updatedAt: new Date("2026-05-02T04:00:00.000Z"),
          researchProposal: {
            status: ProposalStatus.APPROVED,
          },
          progressReport: null,
          thesis: null,
          correctionDocument: null,
        },
      ],
    });

    expect(milestone).toBe("proposal-approval");
  });

  it("moves past thesis submission once the thesis is finalized", () => {
    const milestone = determineCurrentMilestone({
      proposalStatus: ProposalStatus.APPROVED,
      thesisStatus: ThesisStatus.FINAL_ARCHIVE,
      documents: [],
    });

    expect(milestone).toBe("examiner-feedback");
  });

  it("marks examiner feedback complete once results are released", () => {
    const steps = buildProgressStepper({
      currentMilestone: "examiner-feedback",
      proposalApproved: true,
      thesisStarted: true,
      examinerFeedbackReleased: true,
    });

    expect(steps.at(-1)).toMatchObject({
      id: "examiner-feedback",
      state: "complete",
    });
  });

  it("estimates completion dates from the standard programme duration", () => {
    expect(
      getEstimatedCompletionDate(new Date("2026-01-01T00:00:00.000Z"), ProgramType.MPHIL)
        .toISOString(),
    ).toBe("2028-01-01T00:00:00.000Z");

    expect(
      getEstimatedCompletionDate(new Date("2026-01-01T00:00:00.000Z"), ProgramType.PHD)
        .toISOString(),
    ).toBe("2030-01-01T00:00:00.000Z");
  });
});
