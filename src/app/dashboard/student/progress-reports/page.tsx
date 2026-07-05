import Link from "next/link";
import { ProgressReportList } from "@/components/progress-reports/progress-report-list";
import { Button } from "@/components/ui/button";

export default function ProgressReportsHistoryPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Progress Reports</h2>
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/dashboard/student/progress-reports/submit">
              Submit Report
            </Link>
          </Button>
        </div>
      </div>
      <ProgressReportList />
    </div>
  );
}
