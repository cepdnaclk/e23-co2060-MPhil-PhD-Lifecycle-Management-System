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
      <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Viva Voce
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-black">Schedule vivas</h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black">
          Schedule or update viva details for theses currently under examination.
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

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-gray-200 bg-transparent p-6"
        >
          <h2 className="text-xl font-semibold text-black">Viva details</h2>
          <div className="mt-5 grid gap-4">
            <label className="space-y-2 text-base text-black">
              <span>Thesis</span>
              <select
                value={thesisId}
                onChange={(event) => setThesisId(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
              >
                {theses.map((thesis) => (
                  <option key={thesis.id} value={thesis.id}>
                    {thesis.title} - {thesis.student.user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Venue</span>
              <input
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                required
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Date and time</span>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !thesisId}
            className="mt-6 rounded-2xl bg-black px-5 py-3 text-base font-semibold text-black transition hover:bg-black disabled:opacity-60"
          >
            {isSubmitting ? "Scheduling..." : "Schedule viva"}
          </button>
        </form>

        <section className="space-y-4">
          {theses.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-gray-300 bg-transparent p-8 text-base text-black">
              No theses are currently under examination.
            </div>
          ) : (
            theses.map((thesis) => (
              <article
                key={thesis.id}
                className="rounded-[2rem] border border-gray-200 bg-transparent p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-black">{thesis.title}</h3>
                    <p className="mt-1 text-base text-black">
                      {thesis.student.user.displayName} - {thesis.student.user.email}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-300 bg-transparent px-3 py-1 text-base font-semibold text-black">
                    {thesis.viva ? "Scheduled" : "Not scheduled"}
                  </span>
                </div>
                <p className="mt-4 text-base text-black">
                  Examiners:{" "}
                  {thesis.examinerAssignments.length > 0
                    ? thesis.examinerAssignments
                        .map((assignment) => assignment.examiner.user.displayName)
                        .join(", ")
                    : "None assigned"}
                </p>
                {thesis.viva ? (
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-base text-black">
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
