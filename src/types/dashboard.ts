import type { AppUserRole } from "@/types/auth";

export const DASHBOARD_ROLES = [
  "student",
  "supervisor",
  "examiner",
  "admin",
] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type DashboardStatusTone =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export type DashboardKpiCard = {
  id: string;
  title: string;
  value: string;
  description: string;
  statusLabel: string;
  statusTone: DashboardStatusTone;
};

export type DashboardQuickAction = {
  id: string;
  label: string;
  description: string;
  href: string;
};

export type DashboardSummary = {
  role: DashboardRole;
  roleLabel: string;
  title: string;
  subtitle: string;
  cards: DashboardKpiCard[];
  quickActions: DashboardQuickAction[];
  lastUpdatedIso: string;
};

export function isDashboardRole(value: unknown): value is DashboardRole {
  return typeof value === "string" && DASHBOARD_ROLES.includes(value as DashboardRole);
}

export function mapAppRoleToDashboardRole(role: AppUserRole): DashboardRole {
  switch (role) {
    case "STUDENT":
      return "student";
    case "SUPERVISOR":
      return "supervisor";
    case "EXAMINER":
      return "examiner";
    case "ADMINISTRATOR":
      return "admin";
  }
}
