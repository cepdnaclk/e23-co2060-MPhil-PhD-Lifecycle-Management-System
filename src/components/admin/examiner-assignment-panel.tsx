"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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
      setError(caught instanceof Error ? caught.message : "Unable to assign examiner.");
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
      setError(caught instanceof Error ? caught.message : "Unable to update thesis status.");
    }
  }

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Examiner Assignment
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-black">
          Assign examiners to submitted theses
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black">
          Add active examiner profiles, then move the thesis into examination
          when the assignment set is ready for viva scheduling.
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

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <form
          onSubmit={handleAssign}
          className="rounded-[2rem] border border-gray-200 bg-transparent p-6"
        >
          <h2 className="text-xl font-semibold text-black">Add examiner</h2>
          <div className="mt-5 grid gap-4">
            <label className="space-y-2 text-base text-black">
              <span>Thesis</span>
              <select
                value={selectedThesisId}
                onChange={(event) => setSelectedThesisId(event.target.value)}
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
              <span>Examiner</span>
              <select
                value={selectedExaminerId}
                onChange={(event) => setSelectedExaminerId(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                required
              >
                <option value="">Select an examiner...</option>
                {examiners
                  .filter((examiner) => examiner.examinerId)
                  .map((examiner) => (
                    <option key={examiner.id} value={examiner.examinerId ?? ""}>
                      {examiner.displayName} ({examiner.email})
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !selectedThesisId || !selectedExaminerId}
            className="mt-6 rounded-2xl bg-black px-5 py-3 text-base font-semibold text-black transition hover:bg-black disabled:opacity-60"
          >
            {isSubmitting ? "Assigning..." : "Assign examiner"}
          </button>
        </form>

        <section className="space-y-4">
          {theses.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-gray-300 bg-transparent p-8 text-base text-black">
              No submitted or examination-stage theses are available.
            </div>
          ) : (
            theses.map((thesis) => (
              <article
                key={thesis.id}
                className="rounded-[2rem] border border-gray-200 bg-transparent p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                      {thesis.status.replaceAll("_", " ")}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-black">
                      {thesis.title}
                    </h3>
                    <p className="mt-1 text-base text-black">
                      {thesis.student.user.displayName} ({thesis.student.user.email})
                    </p>
                  </div>
                  {thesis.status === "SUBMITTED" ? (
                    <button
                      type="button"
                      onClick={() => void handleStartExamination(thesis.id)}
                      className="rounded-2xl border border-gray-300 px-4 py-2 text-base font-semibold text-black transition hover:border-gray-300"
                    >
                      Start examination
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 space-y-2">
                  {thesis.examinerAssignments.length === 0 ? (
                    <p className="text-base text-gray-400">No examiners assigned.</p>
                  ) : (
                    thesis.examinerAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-base text-black"
                      >
                        {assignment.examiner.user.displayName} -{" "}
                        {assignment.examiner.user.email}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
