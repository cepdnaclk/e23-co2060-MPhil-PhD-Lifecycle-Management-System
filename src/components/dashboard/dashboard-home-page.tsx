import { DashboardSummaryClient } from "@/components/dashboard/dashboard-summary-client";
import type { DashboardSummary, DashboardRole } from "@/types/dashboard";

export function DashboardHomePage({
  role,
  summary,
}: {
  role: DashboardRole;
  summary: DashboardSummary;
}) {
  return (
    <main className="space-y-6">
      <DashboardSummaryClient role={role} initialSummary={summary} />
    </main>
  );
}
