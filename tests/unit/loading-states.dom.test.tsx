/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardPageLoading } from "@/components/dashboard/dashboard-page-loading";
import { LoadingScreen } from "@/components/ui/loading-screen";

describe("Loading states", () => {
  it("announces a branded full-screen loading message", () => {
    render(<LoadingScreen message="Signing you out…" />);

    expect(screen.getByRole("status", { name: "Signing you out…" })).toBeInTheDocument();
    expect(screen.getByText("Signing you out…")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-loader-ring]")).toHaveLength(2);
  });

  it("marks the dashboard skeleton as busy", () => {
    render(<DashboardPageLoading />);

    expect(screen.getByRole("status", { name: "Loading dashboard content" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
