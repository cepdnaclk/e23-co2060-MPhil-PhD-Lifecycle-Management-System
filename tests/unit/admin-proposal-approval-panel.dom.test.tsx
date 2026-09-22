/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProposalApprovalPanel } from "@/components/admin/proposal-approval-panel";
import { secureFetch } from "@/lib/security/client-request";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/security/client-request", () => ({
  secureFetch: vi.fn(),
}));

const proposal = {
  id: "proposal-1",
  title: "Adaptive Thesis Supervision",
  abstract: "A proposal about improving research supervision.",
  status: "UNDER_REVIEW",
  currentVersion: 2,
  updatedAt: "2026-09-20T10:00:00.000Z",
  student: {
    user: { displayName: "Student One", email: "student@example.com" },
  },
  evaluations: [
    {
      id: "evaluation-1",
      feedback: "The proposal is ready for final approval.",
      submissionDate: "2026-09-21T10:00:00.000Z",
      examiner: {
        user: { displayName: "Dr Examiner", email: "examiner@example.com" },
      },
    },
  ],
};

describe("ProposalApprovalPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("approves a proposal as ProposalStatus.APPROVED", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        proposal: { ...proposal, status: "APPROVED" },
      }),
    } as unknown as Response);

    const user = userEvent.setup();
    render(<ProposalApprovalPanel proposals={[proposal]} />);

    expect(screen.getByText("The proposal is ready for final approval.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve Proposal" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Approve the proposal “Adaptive Thesis Supervision”?",
    );
    expect(secureFetch).toHaveBeenCalledWith("/api/proposals/proposal-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});
