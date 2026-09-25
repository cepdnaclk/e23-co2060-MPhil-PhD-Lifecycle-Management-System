/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardPageLoading } from "@/components/dashboard/dashboard-page-loading";
import { LoadingScreen } from "@/components/ui/loading-screen";
import DashboardLoading from "@/app/dashboard/loading";
import AdminDashboardLoading from "@/app/dashboard/admin/loading";
import ExaminerDashboardLoading from "@/app/dashboard/examiner/loading";
import HodDashboardLoading from "@/app/dashboard/hod/loading";
import StudentDashboardLoading from "@/app/dashboard/student/loading";
import SupervisorDashboardLoading from "@/app/dashboard/supervisor/loading";

const dashboardLoadingBoundaries = [
  ["dashboard root", DashboardLoading],
  ["administrator", AdminDashboardLoading],
  ["examiner", ExaminerDashboardLoading],
  ["head of department", HodDashboardLoading],
  ["student", StudentDashboardLoading],
  ["supervisor", SupervisorDashboardLoading],
] as const;

describe("Loading states", () => {
  it("announces a branded full-screen loading message", () => {
    render(<LoadingScreen message="Signing you out…" />);

    expect(screen.getByRole("status", { name: "Signing you out…" })).toBeInTheDocument();
    expect(screen.getByText("Signing you out…")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-loader-ring]")).toHaveLength(2);
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("shows the branded dashboard loader immediately without placeholder boxes", () => {
    render(<DashboardPageLoading />);

    expect(screen.getByRole("status", { name: "Loading dashboard content" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByText("Preparing your workspace")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-loader-ring]")).toHaveLength(2);
    expect(document.querySelector("[data-dashboard-page-loading]")).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it.each(dashboardLoadingBoundaries)(
    "uses the shared loader for the %s loading boundary",
    (_label, LoadingBoundary) => {
      render(<LoadingBoundary />);

      expect(document.querySelector("[data-dashboard-page-loading]")).toBeInTheDocument();
      expect(document.querySelectorAll("[data-loader-ring]")).toHaveLength(2);
    },
  );
});
