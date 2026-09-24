/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  HodApplicationDecisionPanel,
  HodExaminationDecisionPanel,
} from "@/components/hod/department-decision-panels";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("HodExaminationDecisionPanel", () => {
  it("shows examiner reports, PDF evidence, and viva rationales before the outcome", () => {
    render(
      <HodExaminationDecisionPanel
        assignments={[]}
        correctionVivas={[]}
        vivas={[
          {
            id: "viva-1",
            thesisTitle: "Adaptive Systems Thesis",
            recommendationCount: 1,
            examinerEvidence: [
              {
                id: "assignment-1",
                examinerName: "Examiner One",
                report: {
                  recommendation: "MINOR_CORRECTIONS",
                  reportText: "The thesis needs a clearer explanation of the evaluation results.",
                  submittedAt: "2026-05-15T10:00:00.000Z",
                  document: { id: "document-1", fileName: "examiner-report.pdf" },
                },
                vivaRecommendation: {
                  recommendation: "MINOR_CORRECTIONS",
                  rationale: "The oral defense addressed most concerns, with minor revisions remaining.",
                  submittedAt: "2026-05-16T10:00:00.000Z",
                },
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Examiner One")).toBeInTheDocument();
    expect(
      screen.getByText("The thesis needs a clearer explanation of the evaluation results."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The oral defense addressed most concerns, with minor revisions remaining.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open PDF: examiner-report.pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("At least two confirmed Examiners are required; currently 1."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review HOD outcome" })).toBeDisabled();
  });
});

describe("HodApplicationDecisionPanel", () => {
  it("keeps decisions disabled until at least one assigned review is complete", () => {
    render(
      <HodApplicationDecisionPanel
        applications={[
          {
            id: "application-1",
            applicantName: "Applicant One",
            programType: "MPHIL",
            studyMode: "FULL_TIME",
            proposalTitle: "Reliable Research Systems",
            supervisorConsentStatus: "CONSENTED",
            completedReviews: 0,
            totalReviews: 0,
          },
        ]}
      />,
    );

    expect(screen.getByText("Reviews 0/0")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Assign at least one Examiner proposal review before recording a decision.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "APPROVED" })).toBeDisabled();
  });
});
