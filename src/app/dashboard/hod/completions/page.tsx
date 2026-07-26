import { HodDecisionQueueShell } from "@/components/hod/decision-queue-shell";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function HodCompletionsPage() {
  await getServerDashboardContext("hod");

  return (
    <HodDecisionQueueShell
      title="Completion Decisions"
      description="Order corrections and approve correction and programme completion gates."
    />
  );
}
