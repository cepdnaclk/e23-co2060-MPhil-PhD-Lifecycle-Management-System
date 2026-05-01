"use client";

import { useState } from "react";
import useSWR from "swr";

async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load reports");
  return response.json();
}

export function ProgressReportSignoffList() {
  const { data, error, mutate, isLoading } = useSWR("/api/supervisor/progress-reports", fetcher);
  const [signingId, setSigningId] = useState<string | null>(null);

  async function handleSign(reportId: string) {
    setSigningId(reportId);
    try {
      const response = await fetch(`/api/supervisor/progress-reports/${reportId}/sign`, {
        method: "POST",
      });
      if (response.ok) {
        mutate();
      } else {
        const payload = await response.json();
        alert(payload.error || "Failed to sign report");
      }
    } catch (err) {
      alert("A network error occurred");
    } finally {
      setSigningId(null);
    }
  }

  if (isLoading) return <div className="mt-8 animate-pulse space-y-4"><div className="h-20 rounded-2xl bg-slate-900" /></div>;
  if (error) return <div className="mt-8 text-rose-400">Error loading reports</div>;

  const reports = data?.reports || [];

  if (reports.length === 0) {
    return (
      <div className="mt-8 rounded-[2rem] border border-dashed border-slate-700 p-12 text-center text-slate-500">
        No pending progress reports requiring your sign-off.
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {reports.map((report: any) => (
        <article key={report.id} className="rounded-[1.5rem] border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">{report.periodLabel}</span>
                <span className="text-[10px] text-slate-500">Submitted {new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
              <h4 className="mt-1 text-lg font-semibold text-white">{report.student.displayName}</h4>
              <p className="mt-3 text-sm leading-6 text-slate-400 whitespace-pre-wrap">{report.narrative}</p>
            </div>
            <button
              onClick={() => handleSign(report.id)}
              disabled={signingId === report.id}
              className="shrink-0 rounded-2xl bg-sky-400 px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
            >
              {signingId === report.id ? "Signing..." : "Sign Off"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
