/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ApplicationSuccessPage from "@/app/apply/success/page";
import { ProposalRevisionForm } from "@/components/applications/proposal-revision-form";

describe("secondary application pages", () => {
  it("presents proposal revision as a proper page heading", () => {
    render(<ProposalRevisionForm applicationId="" revisionToken="" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Revise application proposal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit revision" })).toBeDisabled();
  });

  it("uses accurate receipt copy when no reference is in the URL", async () => {
    render(await ApplicationSuccessPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Application submitted" })).toBeInTheDocument();
    expect(screen.getByText("Your submission was received successfully.")).toBeInTheDocument();
    expect(screen.queryByText(/Keep this reference/)).not.toBeInTheDocument();
  });
});
