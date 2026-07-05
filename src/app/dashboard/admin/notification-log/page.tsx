import { NotificationLogPanel } from "@/components/admin/notification-log-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function AdminNotificationLogPage() {
  await getServerDashboardContext("admin");

  return <NotificationLogPanel />;
}
