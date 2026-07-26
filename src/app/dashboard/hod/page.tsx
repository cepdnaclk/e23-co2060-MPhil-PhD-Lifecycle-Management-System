import { DashboardHomePage } from "@/components/dashboard/dashboard-home-page";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function HodDashboardPage() {
  const { summary } = await getServerDashboardContext("hod");

  return <DashboardHomePage role="hod" summary={summary} />;
}
