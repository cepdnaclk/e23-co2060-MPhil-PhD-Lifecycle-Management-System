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

  async function runPatch(
    path: string,
    successMessage: string,
    busyKey: string,
  ) {
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
    <div className="space-y-10">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="space-y-4">
          <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
            Thesis Management
          </p>
          <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
            Records Awaiting Archive
          </h2>
          <p className="max-w-2xl text-xl font-medium leading-relaxed text-black/80">
            Oversee the final stages of the postgraduate journey, from 
            correction approvals to permanent repository archiving.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{message}</p>
        </div>
      )}

      <div className="space-y-10">
        {theses.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-20 text-center">
            <p className="text-3xl font-black tracking-tight text-black">Repository Cleared</p>
            <p className="mt-3 text-base font-medium text-black/70">
              No thesis records are currently awaiting final archival.
            </p>
          </div>
        ) : (
          theses.map((thesis) => {
            const hasApprovedCorrection = thesis.corrections.some(
              (correction) => correction.isApproved,
            );
            const canArchive =
              thesis.status === "FINAL_ARCHIVE" ||
              (thesis.status === "CORRECTIONS_REQUIRED" &&
                hasApprovedCorrection);

            return (
              <article
                key={thesis.id}
                className="rounded-[24px] border border-gray-300 bg-white p-6"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <span className="inline-block rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">
                      {thesis.status.replaceAll("_", " ")}
                    </span>
                    <h3 className="text-3xl font-black tracking-tight text-black">
                      {thesis.title}
                    </h3>
                    <p className="text-lg font-medium text-black/70">
                      Candidate: {thesis.student.user.displayName} • {thesis.student.user.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!canArchive || busyId === `archive-${thesis.id}`}
                    onClick={() =>
                      void runPatch(
                        `/api/theses/${thesis.id}/archive`,
                        "Thesis successfully archived and student graduated.",
                        `archive-${thesis.id}`,
                      )
                    }
                    className="group inline-block cursor-pointer rounded-[0.75em] bg-black text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black px-8 py-4 text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                      {busyId === `archive-${thesis.id}`
                        ? "Archiving..."
                        : "Archive & Graduate"}
                    </span>
                  </button>
                </div>

                <div className="mt-12 space-y-6">
                    <div className="flex items-center gap-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                        Correction Workflow
                      </p>
                      <div className="h-px flex-1 bg-gray-300" />
                    </div>

                    {thesis.corrections.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-8 text-center">
                        <p className="text-sm font-bold uppercase tracking-widest text-black/40">Awaiting Correction Documents</p>
                      </div>
                    ) : (
                      <div className="grid gap-6 sm:grid-cols-2">
                        {thesis.corrections.map((correction) => (
                          <div
                            key={correction.id}
                            className="group flex flex-col justify-between rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black"
                          >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-black/40 transition-colors group-hover:text-white/70">
                                  {correction.correctionType} Correction
                                </span>
                                <span className="text-[10px] font-bold text-black/40 transition-colors group-hover:text-white/60">
                                  {new Date(correction.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              {correction.description && (
                                <p className="text-sm font-medium italic leading-relaxed text-black/70 transition-colors group-hover:text-white/80">
                                  "{correction.description}"
                                </p>
                              )}

                              <div className="space-y-2">
                                {correction.documents.map((doc) => (
                                  <div key={doc.id} className="flex items-center gap-3 rounded-[20px] border border-gray-300 bg-white px-4 py-3 transition-colors group-hover:border-white/30 group-hover:bg-transparent">
                                    <svg className="h-4 w-4 text-black/40 transition-colors group-hover:text-white/60" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                    <span className="truncate text-xs font-bold text-black transition-colors group-hover:text-white">{doc.fileName}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="mt-8">
                              <button
                                type="button"
                                disabled={correction.isApproved || busyId === `approve-${correction.id}`}
                                onClick={() =>
                                  void runPatch(
                                    `/api/theses/${thesis.id}/corrections/${correction.id}/approve`,
                                    "Correction approved.",
                                    `approve-${correction.id}`,
                                  )
                                }
                                className={`w-full rounded-xl border-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                                  correction.isApproved
                                    ? "border-black bg-white text-black"
                                    : "border-black bg-white text-black group-hover:border-white group-hover:bg-transparent group-hover:text-white disabled:opacity-20"
                                }`}
                              >
                                {correction.isApproved
                                  ? "Verified Approved"
                                  : busyId === `approve-${correction.id}`
                                    ? "Validating..."
                                    : "Approve Correction"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
