import { HodDecisionQueueShell } from "@/components/hod/decision-queue-shell";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function HodExaminationsPage() {
  await getServerDashboardContext("hod");

  return (
    <HodDecisionQueueShell
      title="Examination Decisions"
      description="Certify readiness, confirm exact examiner assignments, and record viva outcomes."
    />
  );
}
