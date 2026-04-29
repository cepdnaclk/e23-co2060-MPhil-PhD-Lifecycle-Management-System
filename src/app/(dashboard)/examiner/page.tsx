import { DashboardHomePage } from "@/components/dashboard/dashboard-home-page";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function ExaminerDashboardPage() {
  const { summary } = await getServerDashboardContext("examiner");

  return <DashboardHomePage role="examiner" summary={summary} />;
}
