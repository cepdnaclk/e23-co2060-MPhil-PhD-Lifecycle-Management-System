"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ExaminerViva = {
  id: string;
  scheduledDate: string | Date;
  venue: string;
  outcome: string | null;
  thesis: {
    id: string;
    title: string;
    abstract: string;
    status: string;
    student: {
      user: {
        displayName: string;
        email: string;
      };
    };
  };
};

export function VivaWorkspacePanel({ vivas }: { vivas: ExaminerViva[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recordOutcome(vivaId: string) {
    const outcome = selectedOutcome[vivaId];

    if (!outcome) {
      setError("Select an outcome before recording the viva result.");
      return;
    }

    setBusyId(vivaId);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/vivas/${vivaId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outcome }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to record viva outcome.");
      }

      setMessage("Viva outcome recorded.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record viva outcome.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Examiner Workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Assigned vivas
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Review scheduled defenses and record official viva outcomes for
          theses assigned to you.
        </p>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[1.5rem] border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <section className="space-y-4">
        {vivas.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/70 p-8 text-sm text-slate-400">
            No scheduled vivas are assigned to you yet.
          </div>
        ) : (
          vivas.map((viva) => {
            const canRecord = viva.thesis.status === "UNDER_EXAMINATION";

            return (
              <article
                key={viva.id}
                className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {new Date(viva.scheduledDate).toLocaleString()} - {viva.venue}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                      {viva.thesis.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {viva.thesis.student.user.displayName} -{" "}
                      {viva.thesis.student.user.email}
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
                    {viva.outcome ?? viva.thesis.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {viva.thesis.abstract}
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={selectedOutcome[viva.id] ?? ""}
                    onChange={(event) =>
                      setSelectedOutcome((current) => ({
                        ...current,
                        [viva.id]: event.target.value,
                      }))
                    }
                    disabled={!canRecord || Boolean(viva.outcome)}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50"
                  >
                    <option value="">Select outcome...</option>
                    <option value="PASS">Pass</option>
                    <option value="MINOR_CORRECTIONS">Minor corrections</option>
                    <option value="MAJOR_CORRECTIONS">Major corrections</option>
                    <option value="FAIL">Fail</option>
                  </select>
                  <button
                    type="button"
                    disabled={!canRecord || Boolean(viva.outcome) || busyId === viva.id}
                    onClick={() => void recordOutcome(viva.id)}
                    className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {viva.outcome
                      ? "Outcome recorded"
                      : busyId === viva.id
                        ? "Recording..."
                        : "Record outcome"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
