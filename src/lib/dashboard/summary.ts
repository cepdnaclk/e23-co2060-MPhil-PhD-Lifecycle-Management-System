import {
  AcademicStatus,
  ApplicationStatus,
  EthicsApprovalStatus,
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
import { buildDashboardPageMeta } from "@/lib/dashboard/page-meta";

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

function getQuickActions(role: DashboardRole): DashboardQuickAction[] {
  switch (role) {
    case "student":
      return [
        {
          id: "submit-progress-report",
          label: "Submit Progress Report",
          description: "Send your latest update for supervisor sign-off.",
          href: "/dashboard/student/progress-reports/submit",
        },
        {
          id: "view-progress-reports",
          label: "View Progress History",
          description: "Review submitted reports and sign-off status.",
          href: "/dashboard/student/progress-reports",
        },
        {
          id: "view-proposal-status",
          label: "View Proposal Status",
          description: "Check your current proposal status.",
          href: "/dashboard/student/proposals",
        },
        {
          id: "submit-ethics-approval",
          label: "Submit Ethics Approval",
          description: "Upload ethics clearance after proposal approval.",
          href: "/dashboard/student/ethics",
        },
        {
          id: "manage-thesis-documents",
          label: "Manage Thesis Documents",
          description: "Review thesis versions and corrections.",
          href: "/dashboard/student/theses/submit",
        },
        {
          id: "upload-thesis-corrections",
          label: "Upload Thesis Corrections",
          description: "Submit corrected thesis files.",
          href: "/dashboard/student/theses/corrections",
        },
      ];
    case "supervisor":
      return [
        {
          id: "review-proposals",
          label: "Review Proposals",
          description: "Open proposals waiting for your review.",
          href: "/dashboard/supervisor/proposals/evaluate",
        },
        {
          id: "sign-progress-reports",
          label: "Sign Progress Reports",
          description: "Sign reports waiting for your approval.",
          href: "/dashboard/supervisor/progress-reports/sign",
        },
        {
          id: "open-student-roster",
          label: "Student Roster",
          description: "Review assigned students and their progress.",
          href: "/dashboard/supervisor",
        },
      ];
    case "examiner":
      return [
        {
          id: "review-theses",
          label: "Review Theses",
          description: "Open active thesis examinations.",
          href: "/dashboard/examiner/vivas",
        },
        {
          id: "check-viva-schedule",
          label: "Check Viva Schedule",
          description: "Review upcoming vivas.",
          href: "/dashboard/examiner/vivas",
        },
        {
          id: "track-corrections",
          label: "Track Corrections",
          description: "Review corrections that need follow-up.",
          href: "/dashboard/examiner",
        },
      ];
    case "admin":
      return [
        {
          id: "manage-users",
          label: "Manage Users",
          description: "Review and update user accounts.",
          href: "/dashboard/admin/users",
        },
        {
          id: "review-applications",
          label: "Review Applications",
          description: "Review submitted applications.",
          href: "/dashboard/admin/applications",
        },
        {
          id: "approve-proposals",
          label: "Review & Approve Proposals",
          description: "Review supervisor evaluations and finalize proposals.",
          href: "/dashboard/admin/proposals/evaluate",
        },
        {
          id: "review-ethics-approvals",
          label: "Review Ethics Approvals",
          description: "Approve or reject student ethics submissions.",
          href: "/dashboard/admin/ethics",
        },
        {
          id: "manage-assignments",
          label: "Manage Assignments",
          description: "Assign supervisors and examiners.",
          href: "/dashboard/admin/assignments/examiners",
        },
        {
          id: "schedule-vivas",
          label: "Schedule Vivas",
          description: "Set viva dates and venues.",
          href: "/dashboard/admin/vivas/schedule",
        },
        {
          id: "finalize-theses",
          label: "Finalize Theses",
          description: "Approve corrections and archive theses.",
          href: "/dashboard/admin/theses",
        },
        {
          id: "audit-notifications",
          label: "Audit Notifications",
          description: "Review failed notification deliveries.",
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
      title: "Student Overview",
      subtitle: "Dashboard data will appear once your student profile is active.",
      cards: [],
      quickActions: getQuickActions("student"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [
    activeRegistrations,
    activeProposalReviews,
    activeEthicsApprovals,
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
    prisma.ethicsApproval.count({
      where: {
        studentId: student.id,
        isArchived: false,
        status: {
          in: [
            EthicsApprovalStatus.SUBMITTED,
            EthicsApprovalStatus.UNDER_REVIEW,
          ],
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
    title: "Student Overview",
    subtitle: "Track submissions, milestones, and follow-ups.",
    cards: [
      buildCard(
        "student-active-registrations",
        "Active Registrations",
        activeRegistrations,
        "Registration records keeping your programme active.",
        student.academicStatus === AcademicStatus.ACTIVE ? "On track" : student.academicStatus,
        student.academicStatus === AcademicStatus.ACTIVE ? "success" : "warning",
      ),
      buildCard(
        "student-proposals",
        "Proposal Reviews",
        activeProposalReviews,
        "Proposals awaiting a final decision.",
        activeProposalReviews > 0 ? "Needs attention" : "Clear",
        activeProposalReviews > 0 ? "warning" : "success",
      ),
      buildCard(
        "student-ethics-approvals",
        "Ethics Approvals",
        activeEthicsApprovals,
        "Ethics submissions awaiting administrator decision.",
        activeEthicsApprovals > 0 ? "In review" : "Clear",
        activeEthicsApprovals > 0 ? "warning" : "success",
      ),
      buildCard(
        "student-overdue-reports",
        "Overdue Reports",
        overdueReports,
        "Progress reports that need submission or correction.",
        overdueReports > 0 ? "Overdue" : "Up to date",
        overdueReports > 0 ? "danger" : "success",
      ),
      buildCard(
        "student-thesis-milestones",
        "Open Thesis Milestones",
        openThesisMilestones,
        "Thesis records still active in review.",
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
      title: "Supervisor Overview",
      subtitle: "Dashboard data will appear once you have active assignments.",
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
    title: "Supervisor Overview",
    subtitle: "Review your students, proposals, and sign-offs.",
    cards: [
      buildCard(
        "supervisor-assigned-students",
        "Assigned Students",
        assignedStudents,
        "Students currently assigned to you.",
        assignedStudents > 0 ? "Active load" : "No assignments",
        assignedStudents > 0 ? "info" : "neutral",
      ),
      buildCard(
        "supervisor-pending-proposals",
        "Pending Proposal Reviews",
        pendingProposalReviews,
        "Assigned proposals still in review.",
        pendingProposalReviews > 0 ? "Action needed" : "Clear",
        pendingProposalReviews > 0 ? "warning" : "success",
      ),
      buildCard(
        "supervisor-unsigned-reports",
        "Unsigned Reports",
        unsignedReports,
        "Progress reports waiting for your sign-off.",
        unsignedReports > 0 ? "Pending sign-off" : "Signed off",
        unsignedReports > 0 ? "warning" : "success",
      ),
      buildCard(
        "supervisor-panels",
        "Panel Memberships",
        panelMemberships,
        "Review panels where you are a member.",
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
      title: "Examiner Overview",
      subtitle: "Dashboard data will appear once you have active examination assignments.",
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
    title: "Examiner Overview",
    subtitle: "Track assigned theses, vivas, and corrections.",
    cards: [
      buildCard(
        "examiner-assigned-theses",
        "Assigned Theses",
        assignedTheses,
        "Thesis records currently assigned to you.",
        assignedTheses > 0 ? "Assigned" : "No assignments",
        assignedTheses > 0 ? "info" : "neutral",
      ),
      buildCard(
        "examiner-vivas",
        "Scheduled Vivas",
        scheduledVivas,
        "Vivas linked to your assigned theses.",
        scheduledVivas > 0 ? "Upcoming" : "Unscheduled",
        scheduledVivas > 0 ? "success" : "warning",
      ),
      buildCard(
        "examiner-corrections",
        "Pending Corrections",
        pendingCorrections,
        "Corrections still waiting for follow-up.",
        pendingCorrections > 0 ? "Follow-up needed" : "Clear",
        pendingCorrections > 0 ? "warning" : "success",
      ),
      buildCard(
        "examiner-active-work",
        "Active Examinations",
        activeExaminations,
        "Thesis examinations still in progress.",
        activeExaminations > 0 ? "In progress" : "No active work",
        activeExaminations > 0 ? "info" : "neutral",
      ),
    ],
    quickActions: getQuickActions("examiner"),
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function buildAdminSummary(): Promise<DashboardSummary> {
  const [
    activeStaffAccounts,
    pendingApplications,
    archivedTheses,
    failedNotifications,
    pendingEthicsApprovals,
    overdueProgressReports,
    studentsUnderReview,
  ] =
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
      prisma.ethicsApproval.count({
        where: {
          isArchived: false,
          status: {
            in: [
              EthicsApprovalStatus.SUBMITTED,
              EthicsApprovalStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      prisma.progressReport.count({
        where: {
          isOverdue: true,
          isArchived: false,
        },
      }),
      prisma.student.count({
        where: {
          academicStatus: AcademicStatus.UNDER_REVIEW,
          isArchived: false,
        },
      }),
    ]);

  return {
    role: "admin",
    roleLabel: "Administrator",
    title: "Admin Overview",
    subtitle: "Track applications, accounts, theses, and delivery issues.",
    cards: [
      buildCard(
        "admin-staff-accounts",
        "Active Staff Accounts",
        activeStaffAccounts,
        "Active supervisor, examiner, and administrator accounts.",
        activeStaffAccounts > 0 ? "Healthy" : "No active accounts",
        activeStaffAccounts > 0 ? "success" : "warning",
      ),
      buildCard(
        "admin-pending-applications",
        "Pending Applications",
        pendingApplications,
        "Applications waiting for review or a final decision.",
        pendingApplications > 0 ? "Attention needed" : "Clear",
        pendingApplications > 0 ? "warning" : "success",
      ),
      buildCard(
        "admin-archived-theses",
        "Archived Theses",
        archivedTheses,
        "Theses already archived or closed.",
        archivedTheses > 0 ? "Archive active" : "No archived theses",
        archivedTheses > 0 ? "info" : "neutral",
      ),
      buildCard(
        "admin-overdue-progress-reports",
        "Overdue Progress Reports",
        overdueProgressReports,
        "Progress reports that need follow-up.",
        overdueProgressReports > 0 ? "Follow-up needed" : "Clear",
        overdueProgressReports > 0 ? "warning" : "success",
      ),
      buildCard(
        "admin-pending-ethics-approvals",
        "Pending Ethics Approvals",
        pendingEthicsApprovals,
        "Ethics submissions waiting for administrator decision.",
        pendingEthicsApprovals > 0 ? "Review needed" : "Clear",
        pendingEthicsApprovals > 0 ? "warning" : "success",
      ),
      buildCard(
        "admin-students-under-review",
        "Students Under Review",
        studentsUnderReview,
        "Students flagged for academic review.",
        studentsUnderReview > 0 ? "Intervention needed" : "Stable",
        studentsUnderReview > 0 ? "warning" : "success",
      ),
      buildCard(
        "admin-failed-notifications",
        "Failed Notifications",
        failedNotifications,
        "Notification deliveries that need follow-up.",
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

