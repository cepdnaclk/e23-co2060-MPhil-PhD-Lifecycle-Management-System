"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { DashboardNotificationsMenu } from "@/components/dashboard/dashboard-notifications-menu";
import { Bell } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { buildDashboardPageMeta } from "@/lib/dashboard/page-meta";
import type { DashboardRole } from "@/types/dashboard";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

type DashboardRoleLayoutProps = {
  role: DashboardRole;
  children: ReactNode;
};

export function DashboardRoleLayout({
  role,
  children,
}: DashboardRoleLayoutProps) {
  const pathname = usePathname();
  const meta = buildDashboardPageMeta(role);
  const isAdmin = role === "admin";
  const heading = isAdmin ? "Administrator" : meta.eyebrow;

  function isActive(href: string) {
    return pathname === href || (href !== `/dashboard/${role}` && pathname.startsWith(`${href}/`));
  }

  const navItems = getNavItems(role);

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              {heading.charAt(0)}
            </div>
            {heading}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive(`/dashboard/${role}`)}>
                    <Link href={`/dashboard/${role}`}>Overview</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)}>
                      <Link href={item.href}>{item.label}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DashboardNotificationsMenu
                trigger={
                  <SidebarMenuButton tooltip="Notifications">
                    <Bell />
                    <span>Notifications</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/logout"><LogOut /> Sign Out</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header>
          <div className="flex items-center gap-2 max-md:scale-125">
            <SidebarTrigger variant='outline' />
            <Separator orientation='vertical' className='h-6 ml-2 mr-2' />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-medium">{heading} Dashboard</h1>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          {children}
        </Main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function getNavItems(role: DashboardRole) {
  switch (role) {
    case "student":
      return [
        { href: "/dashboard/student/proposals", label: "Proposals" },
        { href: "/dashboard/student/progress-reports", label: "Progress Reports" },
        { href: "/dashboard/student/progress", label: "Milestones" },
        { href: "/dashboard/student/documents", label: "Documents" },
        { href: "/dashboard/student/theses/submit", label: "Thesis Submission" },
        { href: "/dashboard/student/theses/corrections", label: "Corrections" },
      ];
    case "supervisor":
      return [
        { href: "/dashboard/supervisor/students", label: "Student Roster" },
        { href: "/dashboard/supervisor/proposals/evaluate", label: "Review Proposals" },
        { href: "/dashboard/supervisor/progress-reports/sign", label: "Sign Progress Reports" },
        { href: "/dashboard/supervisor/documents", label: "Documents" },
      ];
    case "admin":
      return [
        { href: "/dashboard/admin/users", label: "Manage Users" },
        { href: "/dashboard/admin/applications", label: "Applications" },
        { href: "/dashboard/admin/proposals/evaluate", label: "Approve Proposals" },
        { href: "/dashboard/admin/assignments/supervisors", label: "Supervisor Assignments" },
        { href: "/dashboard/admin/assignments/examiners", label: "Examiner Assignments" },
        { href: "/dashboard/admin/vivas/schedule", label: "Schedule Vivas" },
        { href: "/dashboard/admin/theses", label: "Finalize Theses" },
        { href: "/dashboard/admin/documents", label: "Documents" },
      ];
    case "examiner":
      return [
        { href: "/dashboard/examiner/vivas", label: "Assigned Vivas" },
        { href: "/dashboard/examiner/documents", label: "Documents" },
      ];
    default:
      return [];
  }
}
