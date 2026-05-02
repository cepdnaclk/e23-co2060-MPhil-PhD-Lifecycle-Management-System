/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

import { ApplicationForm } from "@/components/application/application-form";

function createJsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(payload),
  } as Response;
}

async function moveToDocumentsStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Applicant full name"), "Jane Doe");
  await user.type(screen.getByPlaceholderText("name@example.com"), "jane@example.com");
  await user.type(screen.getByPlaceholderText("+94 7X XXX XXXX"), "+94771234567");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Research" }),
    ).toBeInTheDocument();
  });

  await user.type(
    screen.getByPlaceholderText("Machine Learning for Education"),
    "Machine Learning",
  );
  await user.type(
    screen.getByPlaceholderText(
      "Describe your motivation, proposed area, and fit for the programme.",
    ),
    "I want to explore applied AI research for postgraduate study.",
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
    global.fetch = vi.fn();
  });

  it("lets applicants jump back and forth with the step boxes after reaching review", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch as never).mockResolvedValueOnce(
      createJsonResponse({
        storagePath: "applications/application-1/proposal.pdf",
        fileName: "proposal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
      }) as never,
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

  it("removes the uploaded file so another PDF can be selected", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch as never)
      .mockResolvedValueOnce(
        createJsonResponse({
          storagePath: "applications/application-1/proposal.pdf",
          fileName: "proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4096,
        }) as never,
      )
      .mockResolvedValueOnce(createJsonResponse({ ok: true }) as never);

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

    expect(fileInput).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Remove uploaded file" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("proposal.pdf")).not.toBeInTheDocument();
    });

    expect(fileInput).not.toBeDisabled();
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/applications/upload",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
