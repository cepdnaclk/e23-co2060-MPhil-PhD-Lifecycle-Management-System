import type { ReactNode } from "react";

import { DashboardRoleLayout } from "@/components/dashboard/dashboard-role-layout";

export default function StudentDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardRoleLayout role="student">{children}</DashboardRoleLayout>;
}
