/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("swr", async () => {
  const actual = await vi.importActual<typeof import("swr")>("swr");
  return actual;
});

import { DashboardSummaryClient } from "@/components/dashboard/dashboard-summary-client";
import type { DashboardSummary } from "@/types/dashboard";

const fallbackSummary: DashboardSummary = {
  role: "student",
  roleLabel: "Student",
  title: "Your research journey at a glance",
  subtitle: "Track activity",
  cards: [
    {
      id: "card-1",
      title: "Open items",
      value: "2",
      description: "Items awaiting action.",
      statusLabel: "Pending",
      statusTone: "warning",
    },
  ],
  quickActions: [
    {
      id: "submit-progress-report",
      label: "Submit Progress Report",
      description: "Open progress reporting.",
      href: "/dashboard/student/progress-reports/submit",
    },
  ],
  lastUpdatedIso: new Date().toISOString(),
};

describe("dashboard summary integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockRejectedValue(new Error("API failure"));
  });

  it("shows skeleton loaders and offers a retry button when refresh fails", async () => {
    const user = userEvent.setup();

    render(
      <DashboardSummaryClient role="student" initialSummary={fallbackSummary} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("We could not refresh the latest dashboard metrics."),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId("dashboard-skeleton-grid")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(global.fetch).toHaveBeenCalled();
  });
});
