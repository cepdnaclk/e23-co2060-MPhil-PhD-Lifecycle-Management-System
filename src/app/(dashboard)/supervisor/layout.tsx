import type { ReactNode } from "react";

import { DashboardRoleLayout } from "@/components/dashboard/dashboard-role-layout";

export default function SupervisorDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardRoleLayout role="supervisor">{children}</DashboardRoleLayout>;
}
