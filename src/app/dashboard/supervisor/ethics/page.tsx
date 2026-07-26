import { EthicsWorkflowPanel } from "@/components/ethics/ethics-workflow-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function SupervisorEthicsPage() {
  await getServerDashboardContext("supervisor");

  return <EthicsWorkflowPanel role="supervisor" />;
}
