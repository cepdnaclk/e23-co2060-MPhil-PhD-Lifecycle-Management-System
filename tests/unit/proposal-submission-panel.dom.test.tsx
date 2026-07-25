/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProposalSubmissionPanel } from "@/components/proposals/proposal-submission-panel";

describe("ProposalSubmissionPanel staged multi-file flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presents a multi-file picker and rejects more than 10 files", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        proposal: null,
        canSubmitNewVersion: true,
        submissionBlockedReason: null,
        hasActiveRegistration: true,
        applicationId: "application-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ProposalSubmissionPanel />);
    const input = (await screen.findByText(
      /Upload 1–10 PDF or ZIP files as one proposal version/i,
    ))
      .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("multiple");

    fireEvent.change(input, {
      target: {
        files: Array.from({ length: 11 }, (_, index) =>
          new File(["proposal"], `proposal-${index}.pdf`, {
            type: "application/pdf",
          }),
        ),
      },
    });

    expect(
      await screen.findByText(
        "Upload no more than 10 proposal documents in one version.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      "multiple",
    );
  });

  it("locks file replacement while a proposal submission is in flight", async () => {
    let resolveSubmission: ((value: unknown) => void) | undefined;
    const submissionResponse = new Promise((resolve) => {
      resolveSubmission = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal: null,
          canSubmitNewVersion: true,
          submissionBlockedReason: null,
          hasActiveRegistration: true,
          applicationId: "application-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadSessionId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
          uploads: [
            {
              fileId: "file-1",
              fileName: "proposal.pdf",
              signedUrl: "https://storage.example.test/proposal",
              storagePath:
                "proposals/student-1/staged/session/file/proposal.pdf",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockImplementationOnce(() => submissionResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ProposalSubmissionPanel />);
    await screen.findByText(/Upload 1–10 PDF or ZIP files/i);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["proposal"], "proposal.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(await screen.findByText("proposal.pdf")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Research title..."), {
      target: { value: "Adaptive Thesis Supervision" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Summarize your research methodology and impact...",
      ),
      { target: { value: "A complete proposal submission." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit Proposal" }));

    await waitFor(() => expect(fileInput).toBeDisabled());
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["replacement"], "replacement.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.queryByText("replacement.pdf")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    resolveSubmission?.({
      ok: false,
      json: async () => ({ error: "Test submission stopped." }),
    });
    expect(await screen.findByText("Test submission stopped.")).toBeInTheDocument();
  });
});
