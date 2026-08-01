"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { 
  LogOut, 
  Bell,
  LayoutDashboard,
  FileText,
  TrendingUp,
  Milestone,
  FolderOpen,
  GraduationCap,
  FileEdit,
  Users,
  UserCog,
  Inbox,
  UserCheck,
  UserSearch,
  CalendarDays,
  ClipboardCheck,
  RotateCcw,
} from "lucide-react";

import { DashboardNotificationsMenu } from "@/components/dashboard/dashboard-notifications-menu";
import { Header } from "@/components/layout/header";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { buildDashboardPageMeta } from "@/lib/dashboard/page-meta";
import type { DashboardRole } from "@/types/dashboard";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  const heading = meta.eyebrow;

  function isActive(href: string) {
    return pathname === href || (href !== `/dashboard/${role}` && pathname.startsWith(`${href}/`));
  }

  const navItems = getNavItems(role);
  const overviewHref = `/dashboard/${role}`;
  const currentPageLabel =
    navItems.find((item) => isActive(item.href))?.label ?? "Overview";
  const pageHeading = pathname === overviewHref ? heading : currentPageLabel;

  return (
    <SidebarProvider
      data-dashboard-shell
      className="bg-sidebar"
      style={{ "--sidebar-width": "17rem" } as CSSProperties}
    >
      <a
        href="#dashboard-content"
        className="sr-only z-[100] rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-md focus:fixed focus:left-4 focus:top-4 focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to dashboard content
      </a>
      <Sidebar
        variant="inset"
        className="[&>[data-sidebar=sidebar]]:border [&>[data-sidebar=sidebar]]:border-sidebar-border"
      >
        <SidebarHeader className="border-b border-sidebar-border p-3">
          <Link
            href={overviewHref}
            className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Image
              src="/uni-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain"
              priority
            />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold tracking-[-0.02em] text-sidebar-foreground">
                PGLMS
              </p>
              <p className="truncate text-xs text-sidebar-foreground/75">
                {heading}
              </p>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 py-4">
            <SidebarGroupLabel className="px-3 font-semibold">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(overviewHref)}
                    className="h-10 gap-3 rounded-lg px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  >
                    <Link
                      href={overviewHref}
                      aria-current={isActive(overviewHref) ? "page" : undefined}
                    >
                      <LayoutDashboard />
                      <span>Overview</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      className="h-10 gap-3 rounded-lg px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                    >
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? "page" : undefined}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <DashboardNotificationsMenu
                trigger={
                  <SidebarMenuButton
                    tooltip="Notifications"
                    className="h-10 gap-3 rounded-lg px-3"
                  >
                    <Bell />
                    <span>Notifications</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 gap-3 rounded-lg px-3">
                <Link href="/logout"><LogOut /> <span>Sign Out</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset
        id="dashboard-content"
        tabIndex={-1}
        className="overflow-hidden bg-background"
      >
        <Header fixed className="border-b border-border/80 bg-background/95">
          <div className="flex items-center gap-2">
            <SidebarTrigger variant="outline" className="h-9 w-9" />
            <Separator orientation="vertical" className="mx-2 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-[-0.01em] sm:text-base">
              {pageHeading}
            </h1>
          </div>
          <div className="ml-auto flex items-center">
            <ProfileDropdown role={role} />
          </div>
        </Header>
        <div className="mx-auto w-full max-w-[94rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function getNavItems(role: DashboardRole) {
  switch (role) {
    case "student":
      return [
        { href: "/dashboard/student/proposals", label: "Proposals", icon: FileText },
        { href: "/dashboard/student/ethics", label: "Ethics Approval", icon: ClipboardCheck },
        { href: "/dashboard/student/progress-reports", label: "Progress Reports", icon: TrendingUp },
        { href: "/dashboard/student/progress", label: "Milestones", icon: Milestone },
        { href: "/dashboard/student/documents", label: "Documents", icon: FolderOpen },
        { href: "/dashboard/student/theses/submit", label: "Thesis Submission", icon: GraduationCap },
        { href: "/dashboard/student/theses/corrections", label: "Corrections", icon: FileEdit },
      ];
    case "supervisor":
      return [
        { href: "/dashboard/supervisor/students", label: "Student Roster", icon: Users },
        { href: "/dashboard/supervisor/applications", label: "Application Work", icon: Inbox },
        { href: "/dashboard/supervisor/proposals/evaluate", label: "Monitor Proposals", icon: ClipboardCheck },
        { href: "/dashboard/supervisor/ethics", label: "Ethics Recommendations", icon: ClipboardCheck },
        { href: "/dashboard/supervisor/progress-reports", label: "Monitor Reports", icon: TrendingUp },
        { href: "/dashboard/supervisor/corrections", label: "Correction Reviews", icon: FileEdit },
        { href: "/dashboard/supervisor/documents", label: "Documents", icon: FolderOpen },
      ];
    case "admin":
      return [
        { href: "/dashboard/admin/users", label: "Manage Users", icon: UserCog },
        { href: "/dashboard/admin/applications", label: "Applications", icon: Inbox },
        { href: "/dashboard/admin/progress", label: "Department Progress", icon: TrendingUp },
        { href: "/dashboard/admin/ethics", label: "Ethics Documents", icon: ClipboardCheck },
        { href: "/dashboard/admin/assignments/supervisors", label: "Supervisor Assignments", icon: UserCheck },
        { href: "/dashboard/admin/assignments/examiners", label: "Examiner Assignments", icon: UserSearch },
        { href: "/dashboard/admin/vivas/schedule", label: "Schedule Vivas", icon: CalendarDays },
        { href: "/dashboard/admin/theses", label: "Finalize Theses", icon: GraduationCap },
        { href: "/dashboard/admin/completions", label: "Completion Records", icon: ClipboardCheck },
        { href: "/dashboard/admin/documents", label: "Documents", icon: FolderOpen },
        { href: "/dashboard/admin/notification-log", label: "Notification Log", icon: Bell },
        { href: "/dashboard/admin/outbox", label: "Notification Recovery", icon: RotateCcw },
      ];
    case "examiner":
      return [
        { href: "/dashboard/examiner/proposals", label: "Assigned Proposals", icon: ClipboardCheck },
        { href: "/dashboard/examiner/vivas", label: "Assigned Vivas", icon: CalendarDays },
        { href: "/dashboard/examiner/corrections", label: "Correction Reviews", icon: FileEdit },
        { href: "/dashboard/examiner/documents", label: "Documents", icon: FolderOpen },
      ];
    case "hod":
      return [
        { href: "/dashboard/hod/applications", label: "Admission Decisions", icon: Inbox },
        { href: "/dashboard/hod/progress", label: "Department Progress", icon: TrendingUp },
        { href: "/dashboard/hod/ethics", label: "Ethics Confirmations", icon: ClipboardCheck },
        { href: "/dashboard/hod/examinations", label: "Examination Decisions", icon: GraduationCap },
        { href: "/dashboard/hod/completions", label: "Completion Decisions", icon: ClipboardCheck },
      ];
    default:
      return [];
  }
}
