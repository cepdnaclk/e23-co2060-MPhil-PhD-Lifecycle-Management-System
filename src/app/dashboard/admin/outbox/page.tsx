import { OutboxRecoveryPanel } from "@/components/admin/outbox-recovery-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function AdminOutboxPage() {
  await getServerDashboardContext("admin");

  return <OutboxRecoveryPanel />;
}
