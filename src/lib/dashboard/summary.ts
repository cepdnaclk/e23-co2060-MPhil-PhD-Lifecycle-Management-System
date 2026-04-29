import {
  AcademicStatus,
  ApplicationStatus,
  NotificationDeliveryStatus,
  ProposalStatus,
  RegistrationStatus,
  ThesisStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";
import {
  mapAppRoleToDashboardRole,
  type DashboardKpiCard,
  type DashboardQuickAction,
  type DashboardRole,
  type DashboardStatusTone,
  type DashboardSummary,
} from "@/types/dashboard";

export class DashboardAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "DashboardAccessError";
    this.status = status;
  }
}

function buildCard(
  id: string,
  title: string,
  value: number,
  description: string,
  statusLabel: string,
  statusTone: DashboardStatusTone,
): DashboardKpiCard {
  return {
    id,
    title,
    value: value.toString(),
    description,
    statusLabel,
    statusTone,
  };
}

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
  }
}

function getQuickActions(role: DashboardRole): DashboardQuickAction[] {
  switch (role) {
    case "student":
      return [
        {
          id: "submit-progress-report",
          label: "Submit Progress Report",
          description: "Upload your latest progress update for supervisor review.",
          href: "/dashboard/student/progress-reports/submit",
        },
        {
          id: "view-proposal-status",
          label: "View Proposal Status",
          description: "Check the current review state of your proposal submission.",
          href: "/dashboard/student",
        },
        {
          id: "manage-thesis-documents",
          label: "Manage Thesis Documents",
          description: "Track thesis files, versions, and correction requests.",
          href: "/dashboard/student",
        },
      ];
    case "supervisor":
      return [
        {
          id: "review-proposals",
          label: "Review Proposals",
          description: "Open the queue of proposal submissions awaiting your attention.",
          href: "/dashboard/supervisor",
        },
        {
          id: "sign-progress-reports",
          label: "Sign Progress Reports",
          description: "Complete pending supervisor sign-offs for student reports.",
          href: "/dashboard/supervisor",
        },
        {
          id: "open-student-roster",
          label: "Student Roster",
          description: "See all assigned postgraduate researchers and their milestones.",
          href: "/dashboard/supervisor",
        },
      ];
    case "examiner":
      return [
        {
          id: "review-theses",
          label: "Review Theses",
          description: "Open active thesis examinations and review documents.",
          href: "/dashboard/examiner",
        },
        {
          id: "check-viva-schedule",
          label: "Check Viva Schedule",
          description: "See upcoming vivas and associated examination workload.",
          href: "/dashboard/examiner",
        },
        {
          id: "track-corrections",
          label: "Track Corrections",
          description: "Monitor correction requests that still need follow-up.",
          href: "/dashboard/examiner",
        },
      ];
    case "admin":
      return [
        {
          id: "manage-users",
          label: "Manage Users",
          description: "Create, deactivate, and review staff accounts.",
          href: "/dashboard/admin/users",
        },
        {
          id: "review-applications",
          label: "Review Applications",
          description: "Monitor application intake and active review workload.",
          href: "/dashboard/admin",
        },
        {
          id: "audit-notifications",
          label: "Audit Notifications",
          description: "Check delivery failures and follow up on blocked communications.",
          href: "/dashboard/admin",
        },
      ];
  }
}

function ensureRequestedRoleMatchesUser(
  auth: AuthenticatedUserContext,
  requestedRole: DashboardRole,
) {
  const actualRole = mapAppRoleToDashboardRole(auth.role);

  if (actualRole !== requestedRole) {
    throw new DashboardAccessError("Forbidden.", 403);
  }
}

async function buildStudentSummary(
  auth: AuthenticatedUserContext,
): Promise<DashboardSummary> {
  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      academicStatus: true,
    },
  });

  if (!student) {
    return {
      role: "student",
      roleLabel: "Student",
      title: "Your research journey at a glance",
      subtitle: "Your dashboard will fill in as soon as your postgraduate profile is activated.",
      cards: [],
      quickActions: getQuickActions("student"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [
    activeRegistrations,
    activeProposalReviews,
    overdueReports,
    openThesisMilestones,
  ] = await Promise.all([
    prisma.registration.count({
      where: {
        studentId: student.id,
        status: RegistrationStatus.ACTIVE,
      },
    }),
    prisma.researchProposal.count({
      where: {
        studentId: student.id,
        status: {
          in: [ProposalStatus.SUBMITTED, ProposalStatus.UNDER_REVIEW],
        },
      },
    }),
    prisma.progressReport.count({
      where: {
        studentId: student.id,
        isArchived: false,
        isOverdue: true,
      },
    }),
    prisma.thesis.count({
      where: {
        studentId: student.id,
        isArchived: false,
        status: {
          in: [
            ThesisStatus.SUBMITTED,
            ThesisStatus.UNDER_EXAMINATION,
            ThesisStatus.CORRECTIONS_REQUIRED,
          ],
        },
      },
    }),
  ]);

  return {
    role: "student",
    roleLabel: "Student",
    title: "Your research journey at a glance",
    subtitle: "Track your latest submissions, pending milestones, and required follow-ups.",
    cards: [
      buildCard(
        "student-active-registrations",
        "Active Registrations",
        activeRegistrations,
        "Registration records currently keeping your programme in good standing.",
        student.academicStatus === AcademicStatus.ACTIVE ? "On track" : student.academicStatus,
        student.academicStatus === AcademicStatus.ACTIVE ? "success" : "warning",
      ),
      buildCard(
        "student-proposals",
        "Proposal Reviews",
        activeProposalReviews,
        "Proposals that are still waiting for a final outcome.",
        activeProposalReviews > 0 ? "Needs attention" : "Clear",
        activeProposalReviews > 0 ? "warning" : "success",
      ),
      buildCard(
        "student-overdue-reports",
        "Overdue Reports",
        overdueReports,
        "Progress reports that need to be submitted or corrected soon.",
        overdueReports > 0 ? "Overdue" : "Up to date",
        overdueReports > 0 ? "danger" : "success",
      ),
      buildCard(
        "student-thesis-milestones",
        "Open Thesis Milestones",
        openThesisMilestones,
        "Thesis records that are still active in the examination pipeline.",
        openThesisMilestones > 0 ? "In progress" : "None",
        openThesisMilestones > 0 ? "info" : "neutral",
      ),
    ],
    quickActions: getQuickActions("student"),
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function buildSupervisorSummary(
  auth: AuthenticatedUserContext,
): Promise<DashboardSummary> {
  const supervisor = await prisma.supervisor.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  if (!supervisor) {
    return {
      role: "supervisor",
      roleLabel: "Supervisor",
      title: "Supervision overview",
      subtitle: "Your dashboard will appear once your supervisor profile is linked to active assignments.",
      cards: [],
      quickActions: getQuickActions("supervisor"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [assignedStudents, pendingProposalReviews, unsignedReports, panelMemberships] =
    await Promise.all([
      prisma.supervisorAssignment.count({
        where: { supervisorId: supervisor.id },
      }),
      prisma.researchProposal.count({
        where: {
          student: {
            supervisorAssignments: {
              some: {
                supervisorId: supervisor.id,
              },
            },
          },
          status: {
            in: [ProposalStatus.SUBMITTED, ProposalStatus.UNDER_REVIEW],
          },
        },
      }),
      prisma.progressReport.count({
        where: {
          student: {
            supervisorAssignments: {
              some: {
                supervisorId: supervisor.id,
              },
            },
          },
          isArchived: false,
          isSupervisorSignedOff: false,
        },
      }),
      prisma.panelMembership.count({
        where: { supervisorId: supervisor.id },
      }),
    ]);

  return {
    role: "supervisor",
    roleLabel: "Supervisor",
    title: "Supervision overview",
    subtitle: "Review the current supervision load, waiting proposals, and sign-off queue.",
    cards: [
      buildCard(
        "supervisor-assigned-students",
        "Assigned Students",
        assignedStudents,
        "Students currently assigned under your supervision portfolio.",
        assignedStudents > 0 ? "Active load" : "No assignments",
        assignedStudents > 0 ? "info" : "neutral",
      ),
      buildCard(
        "supervisor-pending-proposals",
        "Pending Proposal Reviews",
        pendingProposalReviews,
        "Proposal submissions from your supervisees that are still in review.",
        pendingProposalReviews > 0 ? "Action needed" : "Clear",
        pendingProposalReviews > 0 ? "warning" : "success",
      ),
      buildCard(
        "supervisor-unsigned-reports",
        "Unsigned Reports",
        unsignedReports,
        "Progress reports still waiting for your sign-off.",
        unsignedReports > 0 ? "Pending sign-off" : "Signed off",
        unsignedReports > 0 ? "warning" : "success",
      ),
      buildCard(
        "supervisor-panels",
        "Panel Memberships",
        panelMemberships,
        "Review panels where you are currently listed as a member.",
        panelMemberships > 0 ? "Scheduled" : "None",
        panelMemberships > 0 ? "info" : "neutral",
      ),
    ],
    quickActions: getQuickActions("supervisor"),
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function buildExaminerSummary(
  auth: AuthenticatedUserContext,
): Promise<DashboardSummary> {
  const examiner = await prisma.examiner.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  if (!examiner) {
    return {
      role: "examiner",
      roleLabel: "Examiner",
      title: "Examination workload",
      subtitle: "Your dashboard will populate once active thesis examination assignments are available.",
      cards: [],
      quickActions: getQuickActions("examiner"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [assignedTheses, scheduledVivas, pendingCorrections, activeExaminations] =
    await Promise.all([
      prisma.thesisExaminerAssignment.count({
        where: { examinerId: examiner.id },
      }),
      prisma.viva.count({
        where: {
          thesis: {
            examinerAssignments: {
              some: {
                examinerId: examiner.id,
              },
            },
          },
        },
      }),
      prisma.correctionDocument.count({
        where: {
          isApproved: false,
          thesis: {
            examinerAssignments: {
              some: {
                examinerId: examiner.id,
              },
            },
          },
        },
      }),
      prisma.thesis.count({
        where: {
          examinerAssignments: {
            some: {
              examinerId: examiner.id,
            },
          },
          status: {
            in: [
              ThesisStatus.SUBMITTED,
              ThesisStatus.UNDER_EXAMINATION,
              ThesisStatus.CORRECTIONS_REQUIRED,
            ],
          },
        },
      }),
    ]);

  return {
    role: "examiner",
    roleLabel: "Examiner",
    title: "Examination workload",
    subtitle: "Follow assigned theses, viva preparation, and correction follow-ups in one place.",
    cards: [
      buildCard(
        "examiner-assigned-theses",
        "Assigned Theses",
        assignedTheses,
        "Total thesis records currently linked to your examiner profile.",
        assignedTheses > 0 ? "Assigned" : "No assignments",
        assignedTheses > 0 ? "info" : "neutral",
      ),
      buildCard(
        "examiner-vivas",
        "Scheduled Vivas",
        scheduledVivas,
        "Viva records connected to the theses you are examining.",
        scheduledVivas > 0 ? "Upcoming" : "Unscheduled",
        scheduledVivas > 0 ? "success" : "warning",
      ),
      buildCard(
        "examiner-corrections",
        "Pending Corrections",
        pendingCorrections,
        "Correction documents that still need completion or approval.",
        pendingCorrections > 0 ? "Follow-up needed" : "Clear",
        pendingCorrections > 0 ? "warning" : "success",
      ),
      buildCard(
        "examiner-active-work",
        "Active Examinations",
        activeExaminations,
        "Thesis examinations still active in your current review pipeline.",
        activeExaminations > 0 ? "In progress" : "No active work",
        activeExaminations > 0 ? "info" : "neutral",
      ),
    ],
    quickActions: getQuickActions("examiner"),
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function buildAdminSummary(): Promise<DashboardSummary> {
  const [activeStaffAccounts, pendingApplications, archivedTheses, failedNotifications] =
    await Promise.all([
      prisma.user.count({
        where: {
          role: {
            in: [
              UserRole.SUPERVISOR,
              UserRole.EXAMINER,
              UserRole.ADMINISTRATOR,
            ],
          },
          isActive: true,
        },
      }),
      prisma.application.count({
        where: {
          isArchived: false,
          status: {
            in: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW],
          },
        },
      }),
      prisma.thesis.count({
        where: {
          OR: [
            { isArchived: true },
            { status: ThesisStatus.FINAL_ARCHIVE },
            { status: ThesisStatus.CLOSED },
          ],
        },
      }),
      prisma.notificationLog.count({
        where: {
          deliveryStatus: NotificationDeliveryStatus.FAILED,
        },
      }),
    ]);

  return {
    role: "admin",
    roleLabel: "Administrator",
    title: "Operational control centre",
    subtitle: "Monitor intake, user accounts, archiving, and communication health in real time.",
    cards: [
      buildCard(
        "admin-staff-accounts",
        "Active Staff Accounts",
        activeStaffAccounts,
        "Supervisor, examiner, and administrator accounts currently enabled.",
        activeStaffAccounts > 0 ? "Healthy" : "No active accounts",
        activeStaffAccounts > 0 ? "success" : "warning",
      ),
      buildCard(
        "admin-pending-applications",
        "Pending Applications",
        pendingApplications,
        "Applications still waiting for review or final intake action.",
        pendingApplications > 0 ? "Attention needed" : "Clear",
        pendingApplications > 0 ? "warning" : "success",
      ),
      buildCard(
        "admin-archived-theses",
        "Archived Theses",
        archivedTheses,
        "Theses already archived or formally closed in the lifecycle.",
        archivedTheses > 0 ? "Archive active" : "No archived theses",
        archivedTheses > 0 ? "info" : "neutral",
      ),
      buildCard(
        "admin-failed-notifications",
        "Failed Notifications",
        failedNotifications,
        "Email delivery attempts that need administrative follow-up.",
        failedNotifications > 0 ? "Delivery issues" : "All sent",
        failedNotifications > 0 ? "danger" : "success",
      ),
    ],
    quickActions: getQuickActions("admin"),
    lastUpdatedIso: new Date().toISOString(),
  };
}

export async function getDashboardSummaryForUser(
  auth: AuthenticatedUserContext,
  requestedRole: DashboardRole,
): Promise<DashboardSummary> {
  ensureRequestedRoleMatchesUser(auth, requestedRole);

  switch (requestedRole) {
    case "student":
      return buildStudentSummary(auth);
    case "supervisor":
      return buildSupervisorSummary(auth);
    case "examiner":
      return buildExaminerSummary(auth);
    case "admin":
      return buildAdminSummary();
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
            : "A real-time operations view across accounts, intake, communication, and archive health.",
  };
}
