/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationReviewPanel } from "@/components/admin/application-review-panel";
import { secureFetch } from "@/lib/security/client-request";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/security/client-request", () => ({
  secureFetch: vi.fn(),
}));

const application = {
  id: "application-1",
  applicantName: "Applicant One",
  applicantEmail: "applicant@example.com",
  applicantPhone: "+94770000000",
  researchArea: "Analytics",
  supervisor: null,
  statementOfPurpose: "Postgraduate study",
  programType: "MPHIL",
  status: "SUBMITTED",
  departmentDecision: "APPROVED",
  supervisorConsentStatus: "CONSENTED",
  studyMode: "FULL_TIME",
  proposalTitle: "Privacy-preserving analytics",
  proposalAbstract: "Research proposal",
  createdAt: "2026-09-26T00:00:00.000Z",
  documents: [],
};

describe("ApplicationReviewPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("closes the confirmation dialog and exposes an admission conflict", async () => {
    vi.mocked(secureFetch).mockImplementation(async (path) => {
      if (path === "/api/applications/application-1") {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ application }),
        } as unknown as Response;
      }
      if (path === "/api/admin/users?role=EXAMINER") {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ users: [] }),
        } as unknown as Response;
      }
      if (path === "/api/admin/applications/application-1/execute-admission") {
        return {
          ok: false,
          status: 409,
          json: vi.fn().mockResolvedValue({
            error:
              "This email is already linked to an existing account. Admission cannot create a second Student account; use a different applicant email or resolve the existing account before retrying.",
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected request: ${String(path)}`);
    });

    const user = userEvent.setup();
    render(<ApplicationReviewPanel applicationId="application-1" />);

    await user.click(await screen.findByRole("button", { name: "Execute Admission" }));
    expect(screen.getByRole("dialog", { name: "Execute approved admission" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Execute admission" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Execute approved admission" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This email is already linked to an existing account.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
