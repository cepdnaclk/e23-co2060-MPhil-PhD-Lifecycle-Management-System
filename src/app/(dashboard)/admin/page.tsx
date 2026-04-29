import { DashboardHomePage } from "@/components/dashboard/dashboard-home-page";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function AdminDashboardPage() {
  const { summary } = await getServerDashboardContext("admin");

  return <DashboardHomePage role="admin" summary={summary} />;
}
