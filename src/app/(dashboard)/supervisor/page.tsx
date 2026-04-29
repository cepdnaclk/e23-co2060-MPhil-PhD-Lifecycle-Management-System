import { DashboardHomePage } from "@/components/dashboard/dashboard-home-page";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function SupervisorDashboardPage() {
  const { summary } = await getServerDashboardContext("supervisor");

  return <DashboardHomePage role="supervisor" summary={summary} />;
}
