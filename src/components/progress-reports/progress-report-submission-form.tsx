"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { progressReportSubmissionSchema } from "@/lib/progress-reports/schemas";

export function ProgressReportSubmissionForm() {
  const router = useRouter();
  const [periodLabel, setPeriodLabel] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = progressReportSubmissionSchema.safeParse({
      periodLabel,
      narrative,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? "Invalid progress report details.",
      );
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
          periodLabel: parsed.data.periodLabel,
          narrative: parsed.data.narrative,
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
        <div className="rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="periodLabel" className="text-base font-medium text-black">
          Reporting Period (e.g., Jan-Jun 2024)
        </label>
        <input
          id="periodLabel"
          type="text"
          required
          value={periodLabel}
          onChange={(e) => setPeriodLabel(e.target.value)}
          placeholder="Enter the time period this report covers"
          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-black outline-none transition focus:border-gray-300"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="narrative" className="text-base font-medium text-black">
          Narrative Report
        </label>
        <textarea
          id="narrative"
          required
          rows={10}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Provide a detailed update on your research progress, challenges, and next steps (min 100 characters)..."
          className="w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-3 text-black outline-none transition focus:border-gray-300"
        />
        <p className="text-right text-base text-gray-400">
          {narrative.length} characters (min 100)
        </p>
      </div>

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-2xl border border-gray-300 px-6 py-3 text-base font-semibold text-black transition hover:bg-transparent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            isSubmitting ||
            !progressReportSubmissionSchema.safeParse({
              periodLabel,
              narrative,
            }).success
          }
          className="rounded-2xl bg-black px-8 py-3 text-base font-semibold text-black transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Report"}
        </button>
      </div>
    </form>
  );
}
