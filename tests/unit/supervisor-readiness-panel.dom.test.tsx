/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SupervisorReadinessPanel } from "@/components/thesis-readiness/decision-panels";
import { secureFetch } from "@/lib/security/client-request";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/security/client-request", () => ({
  secureFetch: vi.fn(),
}));

describe("SupervisorReadinessPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("certifies a requested student after every prerequisite is verified", async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ certification: { id: "readiness-1" } }),
    } as unknown as Response);

    const user = userEvent.setup();
    render(
      <SupervisorReadinessPanel
        requests={[
          {
            id: "readiness-1",
            studentName: "Student One",
            studentEmail: "student@example.com",
            studentMessage: "My examination copy is ready.",
            criteria: {
              proposal: true,
              milestones: true,
              ethics: true,
              examinationCopy: true,
            },
          },
        ]}
      />,
    );

    const certifyButton = screen.getByRole("button", {
      name: "Certify Thesis Readiness",
    });
    expect(certifyButton).toBeDisabled();

    for (const checkbox of screen.getAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    expect(certifyButton).toBeEnabled();

    await user.type(
      screen.getByLabelText("Readiness notes for Student One"),
      "All readiness requirements have been verified.",
    );
    await user.click(certifyButton);

    expect(secureFetch).toHaveBeenCalledWith(
      "/api/supervisor/thesis-readiness/readiness-1/certify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decision: "CERTIFIED",
          checklist: {
            proposal: true,
            milestones: true,
            ethics: true,
            examinationCopy: true,
          },
          comments: "All readiness requirements have been verified.",
        }),
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
