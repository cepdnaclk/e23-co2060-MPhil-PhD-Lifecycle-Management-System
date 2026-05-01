import { ProgressReportSubmissionForm } from "@/components/progress-reports/progress-report-submission-form";

export default function SubmitProgressReportPage() {
  return (
    <main className="rounded-[2rem] border border-slate-800 bg-slate-950/70 px-5 py-8 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
        Student Workflow
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">Submit Progress Report</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Provide a periodic update on your research activities. Once submitted, your 
        primary supervisor will review and sign off on the report before it is 
        forwarded to your review panel.
      </p>

      <ProgressReportSubmissionForm />
    </main>
  );
}
