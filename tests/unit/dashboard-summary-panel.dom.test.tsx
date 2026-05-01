/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  DashboardSummaryPanel,
  getStatusBadgeClassName,
} from "@/components/dashboard/dashboard-summary-panel";
import type { DashboardSummary } from "@/types/dashboard";

describe("DashboardSummaryPanel", () => {
  it("renders the empty-state UI when there are no KPI cards", () => {
    const emptySummary: DashboardSummary = {
      role: "student",
      roleLabel: "Student",
      title: "Student dashboard",
      subtitle: "No data yet",
      cards: [],
      quickActions: [],
      lastUpdatedIso: new Date().toISOString(),
    };

    render(<DashboardSummaryPanel summary={emptySummary} />);

    expect(screen.getByTestId("dashboard-empty-state")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("applies the correct classes for color-coded status badges", () => {
    expect(getStatusBadgeClassName("success")).toContain("text-emerald-200");
    expect(getStatusBadgeClassName("warning")).toContain("text-amber-100");
    expect(getStatusBadgeClassName("danger")).toContain("text-rose-100");
    expect(getStatusBadgeClassName("info")).toContain("text-sky-100");
    expect(getStatusBadgeClassName("neutral")).toContain("text-slate-200");
  });

  it("renders quick actions as links to their configured destination", () => {
    const summary: DashboardSummary = {
      role: "supervisor",
      roleLabel: "Supervisor",
      title: "Supervision overview",
      subtitle: "Track pending work",
      cards: [
        {
          id: "unsigned-reports",
          title: "Unsigned Reports",
          value: "1",
          description: "Reports waiting for sign-off.",
          statusLabel: "Pending sign-off",
          statusTone: "warning",
        },
      ],
      quickActions: [
        {
          id: "sign-progress-reports",
          label: "Sign Progress Reports",
          description: "Complete pending supervisor sign-offs for student reports.",
          href: "/dashboard/supervisor/progress-reports/sign",
        },
      ],
      lastUpdatedIso: new Date().toISOString(),
    };

    render(<DashboardSummaryPanel summary={summary} />);

    expect(
      screen.getByRole("link", { name: /Sign Progress Reports/ }),
    ).toHaveAttribute("href", "/dashboard/supervisor/progress-reports/sign");
  });
});
