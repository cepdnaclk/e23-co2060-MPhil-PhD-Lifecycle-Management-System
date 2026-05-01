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
    <div className="min-h-screen bg-[#e0e0e0] text-black">
      <div className="flex min-h-screen w-full flex-col px-4 py-4 sm:px-10 sm:py-10 lg:flex-row lg:gap-10">
        <aside className="mb-4 rounded-[30px] bg-[#e0e0e0] p-6 shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] lg:mb-0 lg:w-72 lg:p-8 shrink-0">
          <p className="text-base font-bold uppercase tracking-[0.28em] text-black">
            {meta.eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{meta.heading}</h1>
          <p className="mt-4 text-base leading-7 text-black">{meta.description}</p>

          <nav className="mt-10 space-y-4">
            <Link
              href={`/dashboard/${role}`}
              className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
            >
              Overview
            </Link>
            {role === "student" ? (
              <>
                <Link
                  href="/dashboard/student/proposals"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Submit Proposal
                </Link>
                <Link
                  href="/dashboard/student/progress-reports"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Progress Reports
                </Link>
                <Link
                  href="/dashboard/student/progress"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Progress Dashboard
                </Link>
                <Link
                  href="/dashboard/student/theses/submit"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Submit Thesis
                </Link>
                <Link
                  href="/dashboard/student/theses/corrections"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Thesis Corrections
                </Link>
              </>
            ) : null}
            {role === "supervisor" ? (
              <>
                <Link
                  href="/dashboard/supervisor/students"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  My Students
                </Link>
                <Link
                  href="/dashboard/supervisor/progress-reports/sign"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Sign Progress Reports
                </Link>
              </>
            ) : null}
            {role === "admin" ? (
              <>
                <Link
                  href="/dashboard/admin/users"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Manage Users
                </Link>
                <Link
                  href="/dashboard/admin/assignments/supervisors"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Supervisor Assignments
                </Link>
                <Link
                  href="/dashboard/admin/assignments/examiners"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Examiner Assignments
                </Link>
                <Link
                  href="/dashboard/admin/vivas/schedule"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Schedule Vivas
                </Link>
                <Link
                  href="/dashboard/admin/theses"
                  className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
                >
                  Finalize Theses
                </Link>
              </>
            ) : null}
            {role === "examiner" ? (
              <Link
                href="/dashboard/examiner/vivas"
                className="group block rounded-2xl border border-gray-300 bg-transparent px-5 py-4 text-base font-bold text-black transition-all hover:bg-black hover:text-white"
              >
                Assigned Vivas
              </Link>
            ) : null}
          </nav>
        </aside>

        <div className="flex-1 rounded-[30px] bg-[#e0e0e0] p-6 shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
