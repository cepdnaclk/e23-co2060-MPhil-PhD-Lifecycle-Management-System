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
          <div key={i} className="h-24 animate-pulse rounded-[1.5rem] border border-gray-200 bg-transparent" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-gray-300 bg-transparent px-4 py-6 text-center">
        <p className="text-base text-black">Unable to load your progress reports.</p>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="mt-8 rounded-[2rem] border border-dashed border-gray-300 bg-transparent/60 px-5 py-12 text-center">
        <h3 className="text-lg font-semibold text-black">No reports found</h3>
        <p className="mt-2 text-base text-black">
          You haven&apos;t submitted any progress reports yet.
        </p>
        <Link
          href="/dashboard/student/progress-reports/submit"
          className="mt-6 inline-block rounded-2xl bg-black px-6 py-3 text-base font-semibold text-black transition hover:bg-black"
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
          className="group rounded-[1.5rem] border border-gray-200 bg-transparent/40 p-5 transition hover:border-gray-300 hover:bg-transparent/60"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.18em] text-black">
                {report.periodLabel}
              </p>
              <h4 className="mt-2 text-lg font-semibold text-black">
                Progress Report
              </h4>
              <p className="mt-3 line-clamp-2 text-base leading-6 text-black">
                {report.narrative}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  report.isSupervisorSignedOff
                    ? "bg-transparent text-black border border-gray-300"
                    : "bg-transparent text-black border border-gray-300"
                }`}
              >
                {report.isSupervisorSignedOff ? "Signed Off" : "Pending Sign-off"}
              </span>
              <p className="text-[10px] text-gray-400">
                Submitted {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
