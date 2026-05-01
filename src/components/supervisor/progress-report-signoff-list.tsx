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

  if (isLoading) return <div className="mt-8 animate-pulse space-y-4"><div className="h-20 rounded-2xl bg-transparent" /></div>;
  if (error) return <div className="mt-8 text-black">Error loading reports</div>;

  const reports = data?.reports || [];

  if (reports.length === 0) {
    return (
      <div className="mt-8 rounded-[2rem] border border-dashed border-gray-300 p-12 text-center text-gray-400">
        No pending progress reports requiring your sign-off.
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {reports.map((report: any) => (
        <article key={report.id} className="rounded-[1.5rem] border border-gray-200 bg-transparent/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold uppercase tracking-wider text-black">{report.periodLabel}</span>
                <span className="text-[10px] text-gray-400">Submitted {new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
              <h4 className="mt-1 text-lg font-semibold text-black">{report.student.displayName}</h4>
              <p className="mt-3 text-base leading-6 text-black whitespace-pre-wrap">{report.narrative}</p>
            </div>
            <button
              onClick={() => handleSign(report.id)}
              disabled={signingId === report.id}
              className="shrink-0 rounded-2xl bg-black px-6 py-2 text-base font-semibold text-black transition hover:bg-black disabled:opacity-50"
            >
              {signingId === report.id ? "Signing..." : "Sign Off"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
