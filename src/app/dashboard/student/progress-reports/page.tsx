import Link from "next/link";
import { ProgressReportList } from "@/components/progress-reports/progress-report-list";

export default function ProgressReportsHistoryPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
              Academic Records
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Progress Reports
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Review your periodic narrative reports and track their supervisor 
              sign-off status.
            </p>
          </div>
          <Link
            href="/dashboard/student/progress-reports/submit"
            className="inline-flex items-center justify-center rounded-2xl bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Submit New Report
          </Link>
        </div>

        <ProgressReportList />
      </section>
    </main>
  );
}
