"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ProgressReportSubmissionForm() {
  const router = useRouter();
  const [periodLabel, setPeriodLabel] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (narrative.length < 100) {
      setErrorMessage("Narrative must be at least 100 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/student/progress-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          periodLabel,
          narrative,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to submit progress report.");
        return;
      }

      router.push("/dashboard/student/progress-reports");
      router.refresh();
    } catch (error) {
      setErrorMessage("A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="periodLabel" className="text-sm font-medium text-slate-300">
          Reporting Period (e.g., Jan-Jun 2024)
        </label>
        <input
          id="periodLabel"
          type="text"
          required
          value={periodLabel}
          onChange={(e) => setPeriodLabel(e.target.value)}
          placeholder="Enter the time period this report covers"
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="narrative" className="text-sm font-medium text-slate-300">
          Narrative Report
        </label>
        <textarea
          id="narrative"
          required
          rows={10}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Provide a detailed update on your research progress, challenges, and next steps (min 100 characters)..."
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-400"
        />
        <p className="text-right text-xs text-slate-500">
          {narrative.length} characters (min 100)
        </p>
      </div>

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || narrative.length < 100 || !periodLabel}
          className="rounded-2xl bg-sky-400 px-8 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Report"}
        </button>
      </div>
    </form>
  );
}
