import type { ReactNode } from "react";

import { DashboardRoleLayout } from "@/components/dashboard/dashboard-role-layout";

export default function HodDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardRoleLayout role="hod">{children}</DashboardRoleLayout>;
}
