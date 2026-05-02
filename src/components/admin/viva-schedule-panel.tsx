"use client";

import { useRouter } from "next/navigation";
import React, { useState, useRef, useEffect, type FormEvent } from "react";

import { scheduleVivaSchema } from "@/lib/vivas/schemas";

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

interface CustomSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  labelMap: Record<T, string>;
  className?: string;
  fullWidth?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function CustomSelect<T extends string>({
  value,
  onChange,
  options,
  labelMap,
  className = "",
  fullWidth = false,
  placeholder = "Select an option...",
  disabled = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={`relative ${fullWidth ? "w-full" : ""} ${className}`}
      ref={containerRef}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border-2 border-black bg-white px-6 py-3 text-base font-black text-black outline-none transition-all hover:bg-gray-50 focus:ring-4 focus:ring-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {value ? labelMap[value] : placeholder}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-[110] mt-2 overflow-hidden rounded-2xl border-2 border-black bg-white shadow-none">
          <ul className="max-h-60 overflow-y-auto py-1">
            {options.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-6 py-3 text-left text-base font-bold transition-colors hover:bg-black hover:text-white ${
                    value === option ? "bg-black/5" : ""
                  }`}
                >
                  {labelMap[option]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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

    const parsedSchedule = scheduleVivaSchema.safeParse({
      thesisId,
      venue,
      scheduledDate,
    });

    if (!parsedSchedule.success) {
      setError(
        parsedSchedule.error.issues[0]?.message ??
          "Invalid viva scheduling details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/vivas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thesisId: parsedSchedule.data.thesisId,
          venue: parsedSchedule.data.venue,
          scheduledDate: parsedSchedule.data.scheduledDate.toISOString(),
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
      setError(
        caught instanceof Error ? caught.message : "Unable to schedule viva.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const thesisOptions = theses.map((t) => t.id);
  const thesisLabels = theses.reduce(
    (acc, t) => {
      acc[t.id] = `${t.title} - ${t.student.user.displayName}`;
      return acc;
    },
    {} as Record<string, string>,
  );

  return (
    <div className="space-y-12">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Administration
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              Viva Voce Scheduling
            </h2>
            <p className="max-w-2xl font-medium text-xl leading-relaxed text-black/80">
              Set examination dates and venues for theses currently under formal
              review.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {message}
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              New Schedule Entry
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-[30px] border-4 border-black bg-white p-8 shadow-[12px_12px_0px_black]"
          >
            <h2 className="text-3xl font-black tracking-tighter text-black">
              Viva Details
            </h2>
            <p className="mt-2 text-base font-medium text-black/60">
              Enter logistics for the upcoming oral examination.
            </p>

            <div className="mt-8 space-y-6">
              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Target Thesis
                </span>
                <CustomSelect
                  value={thesisId}
                  onChange={setThesisId}
                  options={thesisOptions}
                  labelMap={thesisLabels}
                  placeholder="Select a thesis..."
                  fullWidth
                />
              </div>

              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Venue
                </span>
                <input
                  value={venue}
                  onChange={(event) => setVenue(event.target.value)}
                  placeholder="e.g. Boardroom 1 / Zoom Link"
                  className="w-full rounded-2xl border-2 border-black bg-white px-6 py-3 text-base font-black text-black outline-none transition-all hover:bg-gray-50 focus:ring-4 focus:ring-black/5"
                  required
                />
              </div>

              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Date and Time
                </span>
                <input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className="w-full rounded-2xl border-2 border-black bg-white px-6 py-3 text-base font-black text-black outline-none transition-all hover:bg-gray-50 focus:ring-4 focus:ring-black/5"
                  required
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting || !thesisId}
                  className="group inline-block w-full cursor-pointer rounded-[0.75em] bg-black text-base font-bold disabled:opacity-50"
                >
                  <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black box-border px-8 py-4 text-center text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                    {isSubmitting ? "Scheduling..." : "Schedule Viva"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              Upcoming Vivas
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="space-y-6">
            {theses.length === 0 ? (
              <div className="rounded-[30px] border-2 border-dashed border-gray-300 p-12 text-center">
                <p className="font-bold text-black/30">
                  No theses are currently under examination.
                </p>
              </div>
            ) : (
              theses.map((thesis) => (
                <article
                  key={thesis.id}
                  className="rounded-[30px] border-2 border-black bg-white p-6 transition-transform hover:-translate-y-1 hover:shadow-[8px_8px_0px_black]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-xl font-black tracking-tight text-black">
                        {thesis.title}
                      </h3>
                      <p className="mt-1 font-medium text-black/60">
                        {thesis.student.user.displayName} •{" "}
                        {thesis.student.user.email}
                      </p>
                    </div>
                    <span
                      className={`inline-block self-start rounded-full border-2 px-3 py-1 text-[11px] font-black uppercase tracking-widest ${thesis.viva ? "border-black bg-black text-white" : "border-gray-200 text-black/40"}`}
                    >
                      {thesis.viva ? "Scheduled" : "Not Scheduled"}
                    </span>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                        Assigned Examiners
                      </p>
                      <p className="text-sm font-bold text-black">
                        {thesis.examinerAssignments.length > 0
                          ? thesis.examinerAssignments
                              .map(
                                (assignment) =>
                                  assignment.examiner.user.displayName,
                              )
                              .join(", ")
                          : "None assigned"}
                      </p>
                    </div>

                    {thesis.viva && (
                      <div className="flex flex-1 flex-col gap-2 rounded-xl border-2 border-black bg-gray-50 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                            Logistics
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <svg
                            className="h-4 w-4 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <p className="text-sm font-black text-black">
                            {new Date(
                              thesis.viva.scheduledDate,
                            ).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <svg
                            className="h-4 w-4 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <p className="text-sm font-black text-black">
                            {thesis.viva.venue}
                          </p>
                        </div>
                        {thesis.viva.outcome && (
                          <div className="mt-1 border-t border-black/10 pt-2 text-xs font-bold text-black">
                            Status: {thesis.viva.outcome}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

