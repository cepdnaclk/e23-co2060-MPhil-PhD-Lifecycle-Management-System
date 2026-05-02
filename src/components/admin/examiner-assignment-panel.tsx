"use client";

import { useRouter } from "next/navigation";
import React, { useState, useRef, useEffect, type FormEvent } from "react";

type ThesisOption = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  examinerAssignments: Array<{
    id: string;
    examinerId: string;
    examiner: {
      user: {
        displayName: string;
        email: string;
      };
    };
  }>;
};

type ExaminerOption = {
  id: string;
  displayName: string;
  email: string;
  examinerId: string | null;
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

export function ExaminerAssignmentPanel({
  theses,
  examiners,
}: {
  theses: ThesisOption[];
  examiners: ExaminerOption[];
}) {
  const router = useRouter();
  const [selectedThesisId, setSelectedThesisId] = useState(theses[0]?.id ?? "");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitJson(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Action failed.");
    }

    return payload;
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/assignments/examiners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thesisId: selectedThesisId,
          examinerId: selectedExaminerId,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign examiner.");
      }

      setMessage("Examiner assigned to thesis.");
      setSelectedExaminerId("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to assign examiner.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartExamination(thesisId: string) {
    setMessage(null);
    setError(null);

    try {
      await submitJson(`/api/theses/${thesisId}/status`, {
        status: "UNDER_EXAMINATION",
      });
      setMessage("Thesis moved to under examination.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update thesis status.",
      );
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

  const activeExaminers = examiners.filter((e) => e.examinerId);
  const examinerOptions = activeExaminers.map((e) => e.examinerId as string);
  const examinerLabels = activeExaminers.reduce(
    (acc, e) => {
      acc[e.examinerId as string] = `${e.displayName} (${e.email})`;
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
              Examiner Assignments
            </h2>
            <p className="max-w-2xl font-medium text-xl leading-relaxed text-black/80">
              Assign examiners to submitted theses and transition records into
              the examination pipeline.
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

      <div className="grid gap-10 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              Assign New Examiner
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form
            onSubmit={handleAssign}
            className="rounded-[24px] border border-gray-300 bg-white p-8"
          >
            <h2 className="text-3xl font-black tracking-tighter text-black">
              Assignment Control
            </h2>
            <p className="mt-2 text-base font-medium text-black/60">
              Link an active examiner profile to a submitted thesis.
            </p>

            <div className="mt-8 space-y-6">
              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Target Thesis
                </span>
                <CustomSelect
                  value={selectedThesisId}
                  onChange={setSelectedThesisId}
                  options={thesisOptions}
                  labelMap={thesisLabels}
                  placeholder="Select a thesis..."
                  fullWidth
                />
              </div>

              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Examiner
                </span>
                <CustomSelect
                  value={selectedExaminerId}
                  onChange={setSelectedExaminerId}
                  options={examinerOptions}
                  labelMap={examinerLabels}
                  placeholder="Select an examiner..."
                  fullWidth
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={
                    isSubmitting || !selectedThesisId || !selectedExaminerId
                  }
                  className="group inline-block w-full cursor-pointer rounded-[0.75em] bg-black text-base font-bold disabled:opacity-50"
                >
                  <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black box-border px-8 py-4 text-center text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                    {isSubmitting ? "Assigning..." : "Add Assignment"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              Active Examination Queue
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="space-y-6">
            {theses.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-12 text-center">
                <p className="font-bold text-black/40">
                  No submitted or examination-stage theses available.
                </p>
              </div>
            ) : (
              theses.map((thesis) => (
                <article
                  key={thesis.id}
                  className="group rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="inline-block rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
                        {thesis.status.replaceAll("_", " ")}
                      </span>
                      <h3 className="mt-2 text-xl font-black tracking-tight text-black transition-colors group-hover:text-white">
                        {thesis.title}
                      </h3>
                      <p className="mt-1 font-medium text-black/60 transition-colors group-hover:text-white/80">
                        {thesis.student.user.displayName} •{" "}
                        {thesis.student.user.email}
                      </p>
                    </div>

                    {thesis.status === "SUBMITTED" ? (
                      <button
                        type="button"
                        onClick={() => void handleStartExamination(thesis.id)}
                        className="group inline-block cursor-pointer rounded-xl bg-black text-xs font-black uppercase tracking-widest"
                      >
                        <span className="block -translate-y-[0.2em] rounded-xl border-2 border-black bg-white box-border px-4 py-2 text-black transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                          Start examination
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-6 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black/40 transition-colors group-hover:text-white/60">
                        Assigned Examiners
                      </p>
                    {thesis.examinerAssignments.length === 0 ? (
                      <p className="text-sm font-bold italic text-black/40 transition-colors group-hover:text-white/60">
                        Waiting for assignments...
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {thesis.examinerAssignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="rounded-[20px] border border-gray-300 bg-white px-4 py-3 transition-colors group-hover:border-white/30 group-hover:bg-transparent"
                          >
                            <div className="text-sm font-black text-black transition-colors group-hover:text-white">
                              {assignment.examiner.user.displayName}
                            </div>
                            <div className="text-[10px] font-medium text-black/60 transition-colors group-hover:text-white/70">
                              {assignment.examiner.user.email}
                            </div>
                          </div>
                        ))}
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

