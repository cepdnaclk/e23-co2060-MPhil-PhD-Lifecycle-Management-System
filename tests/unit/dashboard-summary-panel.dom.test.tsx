/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DashboardSummaryPanel } from "@/components/dashboard/dashboard-summary-panel";
import type { DashboardSummary } from "@/types/dashboard";

describe("DashboardSummaryPanel", () => {
  it("renders the empty-state UI when there are no KPI cards", () => {
    const emptySummary: DashboardSummary = {
      role: "student",
      roleLabel: "Student",
      title: "Student dashboard",
      subtitle: "No data yet",
      attentionItems: [],
      cards: [],
      quickActions: [],
      lastUpdatedIso: new Date().toISOString(),
    };

    render(<DashboardSummaryPanel summary={emptySummary} />);

    expect(screen.getByTestId("dashboard-empty-state")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("renders quick actions as links to their configured destination", () => {
    const summary: DashboardSummary = {
      role: "supervisor",
      roleLabel: "Supervisor",
      title: "Supervision overview",
      subtitle: "Track pending work",
      attentionItems: [
        {
          id: "unsigned-reports",
          title: "Reports need review",
          description: "Review submitted reports.",
          value: "1",
          href: "/dashboard/supervisor/progress-reports/sign",
          tone: "warning",
        },
      ],
      cards: [
        {
          id: "unsigned-reports",
          title: "Submitted Reports",
          value: "1",
          description: "Reports ready for supervisor monitoring.",
          statusLabel: "Ready to monitor",
          statusTone: "warning",
        },
      ],
      quickActions: [
        {
          id: "monitor-progress-reports",
          label: "Monitor Progress Reports",
          description: "View submitted progress reports for assigned students.",
          href: "/dashboard/supervisor/progress-reports/sign",
        },
      ],
      lastUpdatedIso: new Date().toISOString(),
    };

    render(<DashboardSummaryPanel summary={summary} />);

    expect(
      screen.getByRole("link", { name: /Monitor Progress Reports/ }),
    ).toHaveAttribute("href", "/dashboard/supervisor/progress-reports/sign");
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getAllByText("Reports need review")).toHaveLength(2);
  });
});
