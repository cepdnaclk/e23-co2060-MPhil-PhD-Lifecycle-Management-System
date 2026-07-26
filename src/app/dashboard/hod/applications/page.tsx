import { HodDecisionQueueShell } from "@/components/hod/decision-queue-shell";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function HodApplicationsPage() {
  await getServerDashboardContext("hod");

  return (
    <HodDecisionQueueShell
      title="Admission Decisions"
      description="Decide applications after consent and assigned proposal reviews are complete."
    />
  );
}
