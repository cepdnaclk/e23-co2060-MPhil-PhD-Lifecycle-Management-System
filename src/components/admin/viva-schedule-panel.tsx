"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type ThesisForViva = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  viva: {
    id: string;
    scheduledDate: string | Date;
    venue: string;
    outcome: string | null;
  } | null;
  examinerAssignments: Array<{
    id: string;
    examiner: {
      user: {
        displayName: string;
      };
    };
  }>;
};

export function VivaSchedulePanel({ theses }: { theses: ThesisForViva[] }) {
  const router = useRouter();
  const [thesisId, setThesisId] = useState(theses[0]?.id ?? "");
  const [venue, setVenue] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/vivas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thesisId,
          venue,
          scheduledDate: new Date(scheduledDate).toISOString(),
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to schedule viva.");
      }

      setMessage("Viva scheduled successfully.");
      setVenue("");
      setScheduledDate("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to schedule viva.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Viva Voce
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Schedule vivas</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Schedule or update viva details for theses currently under examination.
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

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6"
        >
          <h2 className="text-xl font-semibold text-white">Viva details</h2>
          <div className="mt-5 grid gap-4">
            <label className="space-y-2 text-sm text-slate-200">
              <span>Thesis</span>
              <select
                value={thesisId}
                onChange={(event) => setThesisId(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
              >
                {theses.map((thesis) => (
                  <option key={thesis.id} value={thesis.id}>
                    {thesis.title} - {thesis.student.user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>Venue</span>
              <input
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>Date and time</span>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !thesisId}
            className="mt-6 rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
          >
            {isSubmitting ? "Scheduling..." : "Schedule viva"}
          </button>
        </form>

        <section className="space-y-4">
          {theses.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/70 p-8 text-sm text-slate-400">
              No theses are currently under examination.
            </div>
          ) : (
            theses.map((thesis) => (
              <article
                key={thesis.id}
                className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{thesis.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {thesis.student.user.displayName} - {thesis.student.user.email}
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
                    {thesis.viva ? "Scheduled" : "Not scheduled"}
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-300">
                  Examiners:{" "}
                  {thesis.examinerAssignments.length > 0
                    ? thesis.examinerAssignments
                        .map((assignment) => assignment.examiner.user.displayName)
                        .join(", ")
                    : "None assigned"}
                </p>
                {thesis.viva ? (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    {new Date(thesis.viva.scheduledDate).toLocaleString()} at{" "}
                    {thesis.viva.venue}
                    {thesis.viva.outcome ? ` - ${thesis.viva.outcome}` : ""}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
