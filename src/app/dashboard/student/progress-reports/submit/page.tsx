import { ProgressReportSubmissionForm } from "@/components/progress-reports/progress-report-submission-form";

export default function SubmitProgressReportPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Submit Report</h2>
      </div>
      <ProgressReportSubmissionForm />
    </div>
  );
}
