import { ProgressReportList } from "@/components/progress-reports/progress-report-list";

export default function ProgressReportsHistoryPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Fixed Progress Milestones</h2>
        <p className="mt-2 text-muted-foreground">
          Submit immutable versions against the next programme milestone.
        </p>
      </div>
      <ProgressReportList />
    </div>
  );
}
