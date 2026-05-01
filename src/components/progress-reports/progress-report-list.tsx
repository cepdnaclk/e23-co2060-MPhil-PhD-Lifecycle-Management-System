"use client";

import useSWR from "swr";
import Link from "next/link";
import { ProgressReport } from "@prisma/client";

async function fetchReports(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load reports");
  const data = await response.json();
  return data.reports as ProgressReport[];
}

export function ProgressReportList() {
  const { data: reports, error, isLoading } = useSWR(
    "/api/student/progress-reports",
    fetchReports
  );

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[1.5rem] border border-slate-800 bg-slate-900/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-6 text-center">
        <p className="text-sm text-rose-100">Unable to load your progress reports.</p>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="mt-8 rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/60 px-5 py-12 text-center">
        <h3 className="text-lg font-semibold text-white">No reports found</h3>
        <p className="mt-2 text-sm text-slate-400">
          You haven&apos;t submitted any progress reports yet.
        </p>
        <Link
          href="/dashboard/student/progress-reports/submit"
          className="mt-6 inline-block rounded-2xl bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Submit your first report
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {reports.map((report) => (
        <article
          key={report.id}
          className="group rounded-[1.5rem] border border-slate-800 bg-slate-900/40 p-5 transition hover:border-slate-700 hover:bg-slate-900/60"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
                {report.periodLabel}
              </p>
              <h4 className="mt-2 text-lg font-semibold text-white">
                Progress Report
              </h4>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
                {report.narrative}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  report.isSupervisorSignedOff
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {report.isSupervisorSignedOff ? "Signed Off" : "Pending Sign-off"}
              </span>
              <p className="text-[10px] text-slate-500">
                Submitted {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
