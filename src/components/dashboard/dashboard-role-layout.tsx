"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Montserrat } from "next/font/google";

import { buildDashboardPageMeta } from "@/lib/dashboard/page-meta";
import type { DashboardRole } from "@/types/dashboard";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
  const heading = isAdmin ? "Administrator Dashboard" : meta.eyebrow;
  const navItemClassName =
    "group block rounded-2xl border px-5 py-4 text-base font-bold transition-all shadow-[8px_8px_16px_#bebebe]";

  function getNavItemClassName(href: string) {
    const isActive =
      pathname === href || (href !== `/dashboard/${role}` && pathname.startsWith(`${href}/`));

    if (isActive) {
      return `${navItemClassName} border-gray-400 bg-gray-300 text-black shadow-[inset_4px_4px_8px_#bebebe]`;
    }

    return `${navItemClassName} border-gray-300 bg-white text-black hover:bg-black hover:text-white`;
  }

  return (
    <div className={`${montserrat.className} h-[100dvh] overflow-hidden bg-[#e0e0e0] text-black`}>
      <div className="box-border flex h-full w-full flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-8">
        <aside className="mb-4 flex shrink-0 flex-col overflow-y-auto rounded-[40px] bg-[#e0e0e0] p-6 shadow-[20px_20px_40px_#bebebe,-20px_-20px_40px_#ffffff] lg:mb-0 lg:w-80 lg:p-10">
          <h1 className="text-3xl font-black tracking-tighter">
            {heading}
          </h1>

          <div className="mt-10 flex flex-col gap-3 flex-1">
            <nav className="contents">
              <Link
                href={`/dashboard/${role}`}
                className={getNavItemClassName(`/dashboard/${role}`)}
              >
                Overview
              </Link>
              
              {role === "student" ? (
                <>
                  <Link href="/dashboard/student/proposals" className={getNavItemClassName("/dashboard/student/proposals")}>Proposals</Link>
                  <Link href="/dashboard/student/progress-reports" className={getNavItemClassName("/dashboard/student/progress-reports")}>Progress Reports</Link>
                  <Link href="/dashboard/student/progress" className={getNavItemClassName("/dashboard/student/progress")}>Milestones</Link>
                  <Link href="/dashboard/student/theses/submit" className={getNavItemClassName("/dashboard/student/theses/submit")}>Thesis Submission</Link>
                  <Link href="/dashboard/student/theses/corrections" className={getNavItemClassName("/dashboard/student/theses/corrections")}>Corrections</Link>
                </>
              ) : null}

              {role === "supervisor" ? (
                <>
                  <Link href="/dashboard/supervisor/students" className={getNavItemClassName("/dashboard/supervisor/students")}>Student Roster</Link>
                  <Link href="/dashboard/supervisor/proposals/evaluate" className={getNavItemClassName("/dashboard/supervisor/proposals/evaluate")}>Review Proposals</Link>
                  <Link href="/dashboard/supervisor/progress-reports/sign" className={getNavItemClassName("/dashboard/supervisor/progress-reports/sign")}>Sign Progress Reports</Link>
                </>
              ) : null}

              {role === "admin" ? (
                <>
                  <Link href="/dashboard/admin/users" className={getNavItemClassName("/dashboard/admin/users")}>Manage Users</Link>
                  <Link href="/dashboard/admin/applications" className={getNavItemClassName("/dashboard/admin/applications")}>Applications</Link>
                  <Link href="/dashboard/admin/proposals/evaluate" className={getNavItemClassName("/dashboard/admin/proposals/evaluate")}>Approve Proposals</Link>
                  <Link href="/dashboard/admin/assignments/supervisors" className={getNavItemClassName("/dashboard/admin/assignments/supervisors")}>Supervisor Assignments</Link>
                  <Link href="/dashboard/admin/assignments/examiners" className={getNavItemClassName("/dashboard/admin/assignments/examiners")}>Examiner Assignments</Link>
                  <Link href="/dashboard/admin/vivas/schedule" className={getNavItemClassName("/dashboard/admin/vivas/schedule")}>Schedule Vivas</Link>
                  <Link href="/dashboard/admin/theses" className={getNavItemClassName("/dashboard/admin/theses")}>Finalize Theses</Link>
                </>
              ) : null}

              {role === "examiner" ? (
                <>
                  <Link href="/dashboard/examiner/vivas" className={getNavItemClassName("/dashboard/examiner/vivas")}>Assigned Vivas</Link>
                </>
              ) : null}
            </nav>
          </div>

          <div className="mt-auto pt-8">
            <Link
              href="/logout"
              className="block rounded-xl border-2 border-black bg-rose-100 px-5 py-4 text-center text-[10px] font-black uppercase tracking-widest text-black transition hover:bg-rose-200 shadow-[8px_8px_16px_#bebebe]"
            >
              Sign Out
            </Link>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto rounded-[40px] bg-[#e0e0e0] p-6 shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
