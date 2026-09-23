/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EthicsApprovalPanel } from "@/components/student/ethics-approval-panel";

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

const emptyOverview = {
  approvals: [],
  latestApproval: null,
  canSubmit: true,
  submissionBlockedReason: null,
  hasActiveRegistration: true,
  hasApprovedProposal: true,
};

describe("EthicsApprovalPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a saved not-required declaration as a successful submission", async () => {
    const submittedRecord = {
      id: "ethics-1",
      title: "No formal approval required",
      summary: "This research does not involve human participants or personal data.",
      applicability: "NOT_REQUIRED",
      status: "PENDING",
      workflowStage: "SUPERVISOR_RECOMMENDATION",
      revisionNumber: 1,
      createdAt: "2026-09-22T00:00:00.000Z",
      updatedAt: "2026-09-22T00:00:00.000Z",
      documents: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(emptyOverview))
      .mockResolvedValueOnce(jsonResponse({ record: submittedRecord }))
      .mockResolvedValueOnce(
        jsonResponse({
          ...emptyOverview,
          approvals: [submittedRecord],
          latestApproval: submittedRecord,
          canSubmit: false,
          submissionBlockedReason: "The current ethics record is awaiting Department action.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<EthicsApprovalPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Ethics applicability"), {
      target: { value: "NOT_REQUIRED" },
    });
    const textInput = container.querySelector('input:not([type="file"])');
    const summaryInput = container.querySelector("textarea");
    expect(textInput).not.toBeNull();
    expect(summaryInput).not.toBeNull();
    fireEvent.change(textInput!, {
      target: { value: submittedRecord.title },
    });
    fireEvent.change(summaryInput!, {
      target: { value: submittedRecord.summary },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Declaration" }));

    expect(
      await screen.findByText("Ethics declaration submitted."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ethics approval submission failed."),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/student/ethics/declaration",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
