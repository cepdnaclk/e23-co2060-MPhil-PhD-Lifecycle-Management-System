/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SupervisorProgressReviewPanel } from "@/components/progress-reports/supervisor-progress-review-panel";
import { secureFetch } from "@/lib/security/client-request";

const mutate = vi.fn().mockResolvedValue(undefined);

vi.mock("swr", () => ({
  default: () => ({
    data: {
      reports: [
        {
          id: "report-1",
          periodLabel: "Milestone 1",
          narrative: "Completed the literature review and initial data collection.",
          status: "SUBMITTED",
          currentVersion: 1,
          submittedAt: "2026-09-22T08:00:00.000Z",
          returnReason: null,
          approvedAt: null,
          documents: [],
          student: {
            id: "student-1",
            displayName: "Student One",
            email: "student@example.com",
          },
        },
      ],
    },
    error: undefined,
    isLoading: false,
    mutate,
  }),
}));

vi.mock("@/lib/security/client-request", () => ({
  secureFetch: vi.fn(),
}));

describe("SupervisorProgressReviewPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("submits supervisor comments when signing off a progress report", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ report: { id: "report-1" } }),
    } as unknown as Response);

    const user = userEvent.setup();
    render(<SupervisorProgressReviewPanel />);

    expect(
      screen.getByText("Completed the literature review and initial data collection."),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Supervisor comments"),
      "Good progress. Approved for the next milestone.",
    );
    await user.click(
      screen.getByRole("button", { name: "Sign Off Progress Report" }),
    );

    expect(secureFetch).toHaveBeenCalledWith(
      "/api/supervisor/progress-reports/report-1/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          reason: "Good progress. Approved for the next milestone.",
        }),
      },
    );
    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  });
});
