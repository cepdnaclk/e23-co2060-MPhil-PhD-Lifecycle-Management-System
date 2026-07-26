/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThesisSubmissionPanel } from "@/components/student/thesis-submission-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("ThesisSubmissionPanel staged multi-file flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presents a multi-file picker and accepts a two-file logical version", async () => {
    const { container } = render(
      <ThesisSubmissionPanel
        thesis={null}
        readiness={{
          id: "ready-1",
          decision: "HOD_APPROVED",
          studentMessage: null,
          supervisorNotes: null,
          hodNotes: null,
        }}
      />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    expect(
      screen.getByText(
        /Upload 1–10 PDF or ZIP files as one thesis version/i,
      ),
    ).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("multiple");

    fireEvent.change(input, {
      target: {
        files: [
          new File(["thesis"], "thesis.pdf", { type: "application/pdf" }),
          new File(["appendix"], "appendix.zip", { type: "application/zip" }),
        ],
      },
    });

    expect(await screen.findByText("thesis.pdf")).toBeInTheDocument();
    expect(await screen.findByText("appendix.zip")).toBeInTheDocument();
  });

  it("locks thesis fields and file replacement while submission is in flight", async () => {
    let resolveSubmission: ((value: unknown) => void) | undefined;
    const submissionResponse = new Promise((resolve) => {
      resolveSubmission = resolve;
    });
    const fetchMock = vi.fn(() => submissionResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ThesisSubmissionPanel
        thesis={null}
        readiness={{
          id: "ready-1",
          decision: "HOD_APPROVED",
          studentMessage: null,
          supervisorNotes: null,
          hodNotes: null,
        }}
      />,
    );
    const titleInput = container.querySelector('input:not([type="file"])') as HTMLInputElement;
    const abstractInput = container.querySelector("textarea") as HTMLTextAreaElement;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(titleInput, {
      target: { value: "Adaptive Systems Thesis" },
    });
    fireEvent.change(abstractInput, {
      target: { value: "A thesis about adaptive systems." },
    });
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["thesis"], "thesis.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.submit(titleInput.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(titleInput).toBeDisabled();
      expect(abstractInput).toBeDisabled();
      expect(fileInput).toBeDisabled();
    });
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["replacement"], "replacement.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    expect(screen.getByText("thesis.pdf")).toBeInTheDocument();
    expect(screen.queryByText("replacement.pdf")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveSubmission?.({
      ok: false,
      json: async () => ({ error: "Test submission stopped." }),
    });
    expect(await screen.findByText("Test submission stopped.")).toBeInTheDocument();
  });
});
