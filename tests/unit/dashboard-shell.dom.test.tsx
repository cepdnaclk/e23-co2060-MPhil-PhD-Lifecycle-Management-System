/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { toggleSidebarMock } = vi.hoisted(() => ({
  toggleSidebarMock: vi.fn(),
}));

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
  const Provider = ({
    defaultOpen,
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }) => (
    <div data-default-open={String(defaultOpen)} {...props}>{children}</div>
  );

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
    SidebarProvider: Provider,
    SidebarTrigger: ({
      icon,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
      <button aria-label="Toggle sidebar" {...props}>{icon}</button>
    ),
    useSidebar: () => ({
      isMobile: false,
      state: "expanded",
      toggleSidebar: toggleSidebarMock,
    }),
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
    expect(shell).toHaveAttribute("data-default-open", "false");
    expect(content).toHaveAttribute("tabindex", "-1");
    expect(within(content as HTMLElement).getByText("Student workspace")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Proposals" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeInTheDocument();
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
    expect(document.querySelector("[data-dashboard-sidebar-scrim]")).toBeInTheDocument();
    const sidebarScrim = screen.getByRole("button", {
      name: "Collapse dashboard navigation",
    });
    expect(sidebarScrim).toBeEnabled();
    fireEvent.click(sidebarScrim);
    expect(toggleSidebarMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-scroll-aware-header]")).toContainElement(
      document.querySelector('[data-brand-ribbons="header"]'),
    );
  });
});
