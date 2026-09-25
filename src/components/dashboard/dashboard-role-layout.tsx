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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { DashboardNotificationsMenu } from "@/components/dashboard/dashboard-notifications-menu";
import { BrandRibbons } from "@/components/layout/brand-ribbons";
import { ScrollAwareHeader } from "@/components/layout/scroll-aware-header";
import { SimpleSiteFooter } from "@/components/layout/simple-site-footer";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { buildDashboardPageMeta } from "@/lib/dashboard/page-meta";
import type { DashboardRole } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

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

  return (
    <SidebarProvider
      data-dashboard-shell
      defaultOpen={false}
      className="relative flex-col bg-background"
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
    >
      <a
        href="#dashboard-content"
        className="sr-only z-[100] rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-md focus:fixed focus:left-4 focus:top-4 focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to dashboard content
      </a>
      <ScrollAwareHeader className="fixed inset-x-0 top-0 z-50 bg-background/95 shadow-[0_8px_28px_rgba(62,28,24,0.07)] backdrop-blur-xl">
        <nav
          className="mx-auto flex min-h-[4.5rem] w-[min(100%_-_2rem,90rem)] items-center gap-3"
          aria-label="Dashboard header"
        >
          <Link
            href={overviewHref}
            className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="PGSMS dashboard overview"
          >
            <Image
              src="/uni-logo.png"
              alt=""
              width={42}
              height={42}
              className="h-[2.6rem] w-[2.6rem] shrink-0 object-contain"
              priority
            />
            <span className="grid min-w-0 gap-0.5 leading-none">
              <strong className="text-[0.96rem] tracking-[0.04em]">PGSMS</strong>
              <small className="truncate text-[0.68rem] text-muted-foreground">
                Computer Engineering
              </small>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SidebarTrigger
              className="h-10 w-10 rounded-full md:hidden"
              aria-label="Open dashboard navigation"
            />
            <DashboardNotificationsMenu
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell className="h-[1.15rem] w-[1.15rem]" />
                </Button>
              }
            />
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
            >
              <Link href="/logout" aria-label="Sign out" title="Sign out">
                <LogOut className="h-[1.15rem] w-[1.15rem]" />
              </Link>
            </Button>
            <ProfileDropdown role={role} />
          </div>
        </nav>
        <BrandRibbons placement="header" />
      </ScrollAwareHeader>

      <Sidebar
        variant="floating"
        collapsible="icon"
        className="!inset-y-auto !top-1/2 !h-[min(72svh,42rem)] -translate-y-1/2 !p-0 !pl-3 !pr-2 [&>[data-sidebar=sidebar]]:rounded-2xl [&>[data-sidebar=sidebar]]:border-primary/15 [&>[data-sidebar=sidebar]]:shadow-[0_20px_55px_rgba(58,32,28,0.16)]"
      >
        <SidebarContent className="dashboard-sidebar-scroll py-2 group-data-[collapsible=icon]:overflow-y-auto">
          <SidebarTrigger
            className="ml-auto mr-2 mt-1 h-9 w-9 rounded-full md:hidden"
            aria-label="Close dashboard navigation"
          />
          <SidebarGroup className="px-2 py-2">
            <SidebarGroupLabel className="px-3 font-semibold">
              {heading}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(overviewHref)}
                    tooltip="Overview"
                    className="h-11 gap-3 rounded-xl px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
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
                      tooltip={item.label}
                      className="h-11 gap-3 rounded-xl px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
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
        <SidebarTrigger
          className="absolute -right-3 top-1/2 z-20 hidden h-9 w-7 -translate-y-1/2 rounded-lg border border-primary/20 bg-background text-primary shadow-[0_6px_18px_rgba(58,32,28,0.16)] hover:bg-primary hover:text-primary-foreground md:inline-flex"
          aria-label="Expand or collapse dashboard navigation"
          title="Expand or collapse navigation"
          icon={
            <>
              <ChevronLeft className="group-data-[state=collapsed]:hidden" />
              <ChevronRight className="hidden group-data-[state=collapsed]:block" />
            </>
          }
        />
      </Sidebar>
      <DashboardSidebarScrim />
      <SidebarInset
        id="dashboard-content"
        tabIndex={-1}
        className="min-h-svh w-full overflow-visible bg-background pt-20 outline-none"
      >
        <div
          className="mx-auto w-full max-w-[94rem] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </div>
        <SimpleSiteFooter className="mt-auto" />
      </SidebarInset>
    </SidebarProvider>
  );
}

function DashboardSidebarScrim() {
  const { isMobile, state, toggleSidebar } = useSidebar();
  const isExpanded = !isMobile && state === "expanded";

  return (
    <button
      type="button"
      data-dashboard-sidebar-scrim
      aria-label="Collapse dashboard navigation"
      disabled={!isExpanded}
      onClick={toggleSidebar}
      className={`fixed inset-x-0 bottom-0 top-20 z-[9] hidden bg-primary/[0.14] backdrop-blur-[1.5px] transition-opacity duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 motion-reduce:transition-none md:block ${
        isExpanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    />
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
        { href: "/dashboard/supervisor/readiness", label: "Thesis Readiness", icon: GraduationCap },
        { href: "/dashboard/supervisor/corrections", label: "Correction Reviews", icon: FileEdit },
        { href: "/dashboard/supervisor/documents", label: "Documents", icon: FolderOpen },
      ];
    case "admin":
      return [
        { href: "/dashboard/admin/users", label: "Manage Users", icon: UserCog },
        { href: "/dashboard/admin/applications", label: "Applications", icon: Inbox },
        { href: "/dashboard/admin/proposals/evaluate", label: "Proposal Approvals", icon: ClipboardCheck },
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
