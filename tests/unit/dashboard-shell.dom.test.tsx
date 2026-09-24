/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/student/proposals",
}));

vi.mock("@/components/dashboard/dashboard-notifications-menu", () => ({
  DashboardNotificationsMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

vi.mock("@/components/profile-dropdown", () => ({
  ProfileDropdown: ({ role }: { role: string }) => <div data-profile-role={role} />,
}));

vi.mock("@/components/ui/sidebar", () => {
  const Container = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  );
  const Button = ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }) => {
    const { isActive: _isActive, tooltip: _tooltip, ...buttonProps } = props;
    return asChild ? children : <button {...buttonProps}>{children}</button>;
  };

  return {
    Sidebar: Container,
    SidebarContent: Container,
    SidebarFooter: Container,
    SidebarGroup: Container,
    SidebarGroupContent: Container,
    SidebarGroupLabel: Container,
    SidebarHeader: Container,
    SidebarInset: Container,
    SidebarMenu: Container,
    SidebarMenuButton: Button,
    SidebarMenuItem: Container,
    SidebarProvider: Container,
    SidebarTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button aria-label="Toggle sidebar" {...props} />
    ),
  };
});

import { DashboardRoleLayout } from "@/components/dashboard/dashboard-role-layout";

describe("DashboardRoleLayout", () => {
  it("provides shared navigation, branded ribbons, content, and the compact footer", () => {
    render(
      <DashboardRoleLayout role="student">
        <p>Student workspace</p>
      </DashboardRoleLayout>,
    );

    const shell = document.querySelector("[data-dashboard-shell]");
    const content = document.querySelector("#dashboard-content");

    expect(shell).toBeInTheDocument();
    expect(content).toHaveAttribute("tabindex", "-1");
    expect(within(content as HTMLElement).getByText("Student workspace")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Proposals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to dashboard content" })).toHaveAttribute(
      "href",
      "#dashboard-content",
    );
    expect(
      Array.from(document.querySelectorAll('[data-brand-ribbons="header"] [data-ribbon-color]')).map(
        (ribbon) => ribbon.getAttribute("data-ribbon-color"),
      ),
    ).toEqual(["gold", "maroon"]);
    expect(document.querySelector('[data-brand-ribbons="footer"]')).not.toBeInTheDocument();
    expect(document.querySelector("[data-simple-site-footer]")).toBeInTheDocument();
    expect(document.querySelector('[data-profile-role="student"]')).toBeInTheDocument();
  });
});
