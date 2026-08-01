/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

import { ApplicationForm } from "@/components/application/application-form";

function createJsonResponse(payload: unknown, ok = true) {
  return new Response(JSON.stringify(payload), {
    status: ok ? 200 : 400,
    headers: { "content-type": "application/json" },
  });
}

async function moveToDocumentsStep(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByPlaceholderText("Applicant full name"), {
    target: { value: "Jane Doe" },
  });
  fireEvent.change(screen.getByPlaceholderText("name@example.com"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("+94 7X XXX XXXX"), {
    target: { value: "+94771234567" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Research" }),
    ).toBeInTheDocument();
  });

  fireEvent.change(screen.getByPlaceholderText("Machine Learning for Education"), {
    target: { value: "Machine Learning" },
  });
  fireEvent.change(screen.getByLabelText("Proposal title"), {
    target: { value: "Adaptive learning systems" },
  });
  fireEvent.change(screen.getByLabelText("Proposal abstract"), {
    target: {
      value:
        "A detailed proposal for adaptive learning systems in postgraduate education.",
    },
  });
  fireEvent.change(
    screen.getByPlaceholderText(
      "Describe your motivation, proposed area, and fit for the programme.",
    ),
    {
      target: {
        value: "I want to explore applied AI research for postgraduate study.",
      },
    },
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Documents" }),
    ).toBeInTheDocument();
  });
}

describe("ApplicationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.sessionStorage.clear();
  });

  it("autosaves typed fields to the protected server draft", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
          draftToken: "a".repeat(43),
          expiresAt: "2026-08-02T10:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ supervisors: [] }))
      .mockResolvedValueOnce(
        createJsonResponse({
          savedAt: "2026-08-01T10:05:00.000Z",
          expiresAt: "2026-08-02T10:00:00.000Z",
        }),
      );

    render(<ApplicationForm />);
    await screen.findByText("Protected draft ready");
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Jane Doe" },
    });

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/applications/drafts",
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"applicantName":"Jane Doe"'),
          }),
        );
      },
      { timeout: 2_000 },
    );
    expect(await screen.findByText(/Draft saved/)).toBeInTheDocument();
  });

  it("lets applicants jump back and forth with the step boxes after reaching review", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
        draftToken: "a".repeat(43),
      }),
    );
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        supervisors: [
          {
            id: "supervisor-1",
            displayName: "Dr. Supervisor",
            specialization: "AI",
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        storagePath: "applications/application-1/proposal.pdf",
        fileName: "proposal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
      }),
    );

    const { container } = render(<ApplicationForm />);

    await moveToDocumentsStep(user);

    const fileInput = container.querySelector("input[type='file']");

    expect(fileInput).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      fileInput as HTMLInputElement,
      new File(["pdf"], "proposal.pdf", { type: "application/pdf" }),
    );
    await waitFor(() => {
      expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: "Review" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Go to Applicant step" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: "Applicant" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Go to Review step" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: "Review" }),
      ).toBeInTheDocument();
    });
  });

  it("removes an uploaded file so another PDF can be selected", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
          draftToken: "a".repeat(43),
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          supervisors: [
            {
              id: "supervisor-1",
              displayName: "Dr. Supervisor",
              specialization: "AI",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          storagePath: "applications/application-1/proposal.pdf",
          fileName: "proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const { container } = render(<ApplicationForm />);

    await moveToDocumentsStep(user);

    const fileInput = container.querySelector("input[type='file']");

    expect(fileInput).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      fileInput as HTMLInputElement,
      new File(["pdf"], "proposal.pdf", { type: "application/pdf" }),
    );

    await waitFor(() => {
      expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    });

    expect(fileInput).not.toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Remove uploaded file" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("proposal.pdf")).not.toBeInTheDocument();
    });

    expect(fileInput).not.toBeDisabled();
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      "/api/applications/upload",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
