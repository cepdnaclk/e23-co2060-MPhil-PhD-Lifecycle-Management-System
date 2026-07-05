import { EthicsApprovalReviewPanel } from "@/components/admin/ethics-approval-review-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";

export default async function AdminEthicsApprovalPage() {
  await getServerDashboardContext("admin");

  return <EthicsApprovalReviewPanel />;
}
