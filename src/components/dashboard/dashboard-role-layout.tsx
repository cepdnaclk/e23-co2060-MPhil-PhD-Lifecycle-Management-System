import Link from "next/link";
import type { ReactNode } from "react";

import { buildDashboardPageMeta } from "@/lib/dashboard/summary";
import type { DashboardRole } from "@/types/dashboard";

type DashboardRoleLayoutProps = {
  role: DashboardRole;
  children: ReactNode;
};

export function DashboardRoleLayout({
  role,
  children,
}: DashboardRoleLayoutProps) {
  const meta = buildDashboardPageMeta(role);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_26%),linear-gradient(180deg,_#020617_0%,_#0f172a_46%,_#111827_100%)] text-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-6">
        <aside className="mb-4 rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] lg:mb-0 lg:w-80 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">
            {meta.eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{meta.heading}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{meta.description}</p>

          <nav className="mt-8 space-y-3">
            <Link
              href={`/dashboard/${role}`}
              className="block rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-sky-400 hover:text-white"
            >
              Overview
            </Link>
            {role === "student" ? (
              <>
                <Link
                  href="/dashboard/student/proposals"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Submit Proposal
                </Link>
                <Link
                  href="/dashboard/student/progress-reports"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Progress Reports
                </Link>
                <Link
                  href="/dashboard/student/progress"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Progress Dashboard
                </Link>
                <Link
                  href="/dashboard/student/theses/submit"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Submit Thesis
                </Link>
                <Link
                  href="/dashboard/student/theses/corrections"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Thesis Corrections
                </Link>
              </>
            ) : null}
            {role === "supervisor" ? (
              <>
                <Link
                  href="/dashboard/supervisor/students"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  My Students
                </Link>
                <Link
                  href="/dashboard/supervisor/progress-reports/sign"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Sign Progress Reports
                </Link>
              </>
            ) : null}
            {role === "admin" ? (
              <>
                <Link
                  href="/dashboard/admin/users"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Manage Users
                </Link>
                <Link
                  href="/dashboard/admin/assignments/supervisors"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Supervisor Assignments
                </Link>
                <Link
                  href="/dashboard/admin/assignments/examiners"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Examiner Assignments
                </Link>
                <Link
                  href="/dashboard/admin/vivas/schedule"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Schedule Vivas
                </Link>
                <Link
                  href="/dashboard/admin/theses"
                  className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
                >
                  Finalize Theses
                </Link>
              </>
            ) : null}
            {role === "examiner" ? (
              <Link
                href="/dashboard/examiner/vivas"
                className="block rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white"
              >
                Assigned Vivas
              </Link>
            ) : null}
          </nav>
        </aside>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
