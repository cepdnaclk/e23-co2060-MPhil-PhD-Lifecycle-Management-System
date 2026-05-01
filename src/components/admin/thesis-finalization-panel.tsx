"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ThesisFinalizationItem = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  corrections: Array<{
    id: string;
    correctionType: string;
    description: string | null;
    isApproved: boolean;
    createdAt: string | Date;
    documents: Array<{
      id: string;
      fileName: string;
      storagePath: string;
    }>;
  }>;
};

export function ThesisFinalizationPanel({
  theses,
}: {
  theses: ThesisFinalizationItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPatch(path: string, successMessage: string, busyKey: string) {
    setBusyId(busyKey);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Finalization
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Corrections and final archive
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Approve submitted correction documents and archive theses that have
          passed or completed corrections.
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
        {theses.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/70 p-8 text-sm text-slate-400">
            No theses are awaiting correction approval or archive.
          </div>
        ) : (
          theses.map((thesis) => {
            const hasApprovedCorrection = thesis.corrections.some(
              (correction) => correction.isApproved,
            );
            const canArchive =
              thesis.status === "FINAL_ARCHIVE" ||
              (thesis.status === "CORRECTIONS_REQUIRED" && hasApprovedCorrection);

            return (
              <article
                key={thesis.id}
                className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {thesis.status.replaceAll("_", " ")}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                      {thesis.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {thesis.student.user.displayName} - {thesis.student.user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canArchive || busyId === `archive-${thesis.id}`}
                    onClick={() =>
                      void runPatch(
                        `/api/theses/${thesis.id}/archive`,
                        "Thesis archived and student marked as graduated.",
                        `archive-${thesis.id}`,
                      )
                    }
                    className="rounded-2xl border border-emerald-400/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === `archive-${thesis.id}`
                      ? "Archiving..."
                      : "Archive & graduate"}
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {thesis.corrections.length === 0 ? (
                    <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400">
                      No correction documents submitted.
                    </p>
                  ) : (
                    thesis.corrections.map((correction) => (
                      <div
                        key={correction.id}
                        className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-white">
                              {correction.correctionType} correction
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(correction.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={
                              correction.isApproved ||
                              busyId === `approve-${correction.id}`
                            }
                            onClick={() =>
                              void runPatch(
                                `/api/theses/${thesis.id}/corrections/${correction.id}/approve`,
                                "Correction approved.",
                                `approve-${correction.id}`,
                              )
                            }
                            className="rounded-2xl border border-sky-400/40 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {correction.isApproved
                              ? "Approved"
                              : busyId === `approve-${correction.id}`
                                ? "Approving..."
                                : "Approve"}
                          </button>
                        </div>
                        {correction.description ? (
                          <p className="mt-3 text-sm leading-6 text-slate-300">
                            {correction.description}
                          </p>
                        ) : null}
                        {correction.documents.map((document) => (
                          <p
                            key={document.id}
                            className="mt-3 break-all text-xs text-slate-400"
                          >
                            {document.fileName}: {document.storagePath}
                          </p>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
