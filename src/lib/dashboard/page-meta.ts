import type { DashboardRole } from "@/types/dashboard";

function formatRoleLabel(role: DashboardRole) {
  switch (role) {
    case "student":
      return "Student";
    case "supervisor":
      return "Supervisor";
    case "examiner":
      return "Examiner";
    case "admin":
      return "Administrator";
    case "hod":
      return "Head of Department";
  }
}

export function buildDashboardPageMeta(role: DashboardRole) {
  const roleLabel = formatRoleLabel(role);

  return {
    eyebrow: `${roleLabel} Dashboard`,
    heading: `${roleLabel} workspace`,
    description:
      role === "student"
        ? "A focused dashboard for your academic progress, submissions, and deadlines."
        : role === "supervisor"
          ? "A live view of supervision workload, pending approvals, and student progress."
          : role === "examiner"
            ? "A concise home for thesis examination tasks, vivas, and correction follow-up."
            : role === "admin"
              ? "Centralized management for system users, applications, and operational health."
              : "Department decisions for admission, examination, corrections, and completion.",
  };
}
