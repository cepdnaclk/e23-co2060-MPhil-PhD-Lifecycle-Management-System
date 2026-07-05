"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
  ClipboardCheck
} from "lucide-react";

import { DashboardNotificationsMenu } from "@/components/dashboard/dashboard-notifications-menu";
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
                    <Link href={`/dashboard/${role}`}>
                      <LayoutDashboard />
                      <span>Overview</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)}>
                      <Link href={item.href}>
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
        { href: "/dashboard/supervisor/proposals/evaluate", label: "Review Proposals", icon: ClipboardCheck },
        { href: "/dashboard/supervisor/progress-reports/sign", label: "Sign Progress Reports", icon: TrendingUp },
        { href: "/dashboard/supervisor/documents", label: "Documents", icon: FolderOpen },
      ];
    case "admin":
      return [
        { href: "/dashboard/admin/users", label: "Manage Users", icon: UserCog },
        { href: "/dashboard/admin/applications", label: "Applications", icon: Inbox },
        { href: "/dashboard/admin/proposals/evaluate", label: "Approve Proposals", icon: ClipboardCheck },
        { href: "/dashboard/admin/ethics", label: "Ethics Approvals", icon: ClipboardCheck },
        { href: "/dashboard/admin/assignments/supervisors", label: "Supervisor Assignments", icon: UserCheck },
        { href: "/dashboard/admin/assignments/examiners", label: "Examiner Assignments", icon: UserSearch },
        { href: "/dashboard/admin/vivas/schedule", label: "Schedule Vivas", icon: CalendarDays },
        { href: "/dashboard/admin/theses", label: "Finalize Theses", icon: GraduationCap },
        { href: "/dashboard/admin/documents", label: "Documents", icon: FolderOpen },
        { href: "/dashboard/admin/notification-log", label: "Notification Log", icon: Bell },
      ];
    case "examiner":
      return [
        { href: "/dashboard/examiner/vivas", label: "Assigned Vivas", icon: CalendarDays },
        { href: "/dashboard/examiner/documents", label: "Documents", icon: FolderOpen },
      ];
    default:
      return [];
  }
}
