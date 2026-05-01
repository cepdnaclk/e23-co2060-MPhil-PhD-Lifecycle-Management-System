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
      <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Examiner Workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-black">
          Assigned vivas
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black">
          Review scheduled defenses and record official viva outcomes for
          theses assigned to you.
        </p>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {message}
        </div>
      ) : null}

      <section className="space-y-4">
        {vivas.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-gray-300 bg-transparent p-8 text-base text-black">
            No scheduled vivas are assigned to you yet.
          </div>
        ) : (
          vivas.map((viva) => {
            const canRecord = viva.thesis.status === "UNDER_EXAMINATION";

            return (
              <article
                key={viva.id}
                className="rounded-[2rem] border border-gray-200 bg-transparent p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                      {new Date(viva.scheduledDate).toLocaleString()} - {viva.venue}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-black">
                      {viva.thesis.title}
                    </h2>
                    <p className="mt-1 text-base text-black">
                      {viva.thesis.student.user.displayName} -{" "}
                      {viva.thesis.student.user.email}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-300 bg-transparent px-3 py-1 text-base font-semibold text-black">
                    {viva.outcome ?? viva.thesis.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-base leading-6 text-black">
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
                    className="rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base text-black outline-none focus:border-gray-300 disabled:opacity-50"
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
                    className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-black transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
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
