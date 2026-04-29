import { DashboardHomePage } from "@/components/dashboard/dashboard-home-page";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function StudentDashboardPage() {
  const { summary } = await getServerDashboardContext("student");

  return <DashboardHomePage role="student" summary={summary} />;
}
