import { EthicsWorkflowPanel } from "@/components/ethics/ethics-workflow-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function HodEthicsPage() {
  await getServerDashboardContext("hod");

  return <EthicsWorkflowPanel role="hod" />;
}
