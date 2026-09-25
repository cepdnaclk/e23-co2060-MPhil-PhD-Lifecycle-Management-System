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
  type DashboardAttentionItem,
  type DashboardJourney,
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

function buildAttentionItem(
  id: string,
  title: string,
  value: number,
  description: string,
  href: string,
  tone: DashboardStatusTone,
): DashboardAttentionItem {
  return {
    id,
    title,
    value: value.toString(),
    description,
    href,
    tone,
  };
}

function buildStudentJourney({
  academicStatus,
  activeRegistrations,
  activeProposalReviews,
  activeEthicsApprovals,
  openThesisMilestones,
}: {
  academicStatus: AcademicStatus;
  activeRegistrations: number;
  activeProposalReviews: number;
  activeEthicsApprovals: number;
  openThesisMilestones: number;
}): DashboardJourney {
  const labels = [
    "Registration",
    "Proposal",
    "Ethics",
    "Research progress",
    "Thesis",
    "Completion",
  ];

  let currentIndex = 0;

  if (academicStatus === AcademicStatus.GRADUATED) {
    currentIndex = labels.length - 1;
  } else if (openThesisMilestones > 0) {
    currentIndex = 4;
  } else if (activeEthicsApprovals > 0) {
    currentIndex = 3;
  } else if (activeProposalReviews > 0 || activeRegistrations > 0) {
    currentIndex = 1;
  }

  return {
    title: "Your programme journey",
    currentStage: labels[currentIndex],
    description:
      academicStatus === AcademicStatus.GRADUATED
        ? "Your programme record is marked as completed."
        : `Your current recorded stage is ${labels[currentIndex].toLowerCase()}.`,
    steps: labels.map((label, index) => ({
      id: label.toLowerCase().replaceAll(" ", "-"),
      label,
      state:
        academicStatus === AcademicStatus.GRADUATED || index < currentIndex
          ? "complete"
          : index === currentIndex
            ? "current"
            : "upcoming",
    })),
  };
}

function getQuickActions(role: DashboardRole): DashboardQuickAction[] {
  switch (role) {
    case "student":
      return [
        {
          id: "submit-progress-report",
          label: "Open Progress Milestones",
          description: "Submit the next fixed milestone version.",
          href: "/dashboard/student/progress-reports",
        },
        {
          id: "view-proposal-status",
          label: "View Proposal Status",
          description: "Check your current proposal status.",
          href: "/dashboard/student/proposals",
        },
        {
          id: "manage-thesis-documents",
          label: "Request Thesis Readiness",
          description: "Verify prerequisites and request Supervisor certification.",
          href: "/dashboard/student/theses/submit",
        },
      ];
    case "supervisor":
      return [
        {
          id: "review-proposals",
          label: "Monitor Proposals",
          description: "View proposals submitted by your assigned students.",
          href: "/dashboard/supervisor/proposals/evaluate",
        },
        {
          id: "open-student-roster",
          label: "Student Roster",
          description: "Review assigned students and their progress.",
          href: "/dashboard/supervisor/students",
        },
        {
          id: "certify-corrections",
          label: "Certify Corrections",
          description: "Review exact correction versions from assigned Students.",
          href: "/dashboard/supervisor/corrections",
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
          id: "track-corrections",
          label: "Track Corrections",
          description: "Review corrections that need follow-up.",
          href: "/dashboard/examiner/corrections",
        },
      ];
    case "admin":
      return [
        {
          id: "review-applications",
          label: "Review Applications",
          description: "Review submitted applications.",
          href: "/dashboard/admin/applications",
        },
        {
          id: "review-department-progress",
          label: "Review Department Progress",
          description: "Follow overdue reports and students under review.",
          href: "/dashboard/admin/progress",
        },
        {
          id: "audit-notifications",
          label: "Recover Notifications",
          description: "Inspect and retry failed notification deliveries.",
          href: "/dashboard/admin/outbox",
        },
      ];
    case "hod":
      return [
        {
          id: "admission-decisions",
          label: "Admission Decisions",
          description: "Review complete applications and proposal reviews.",
          href: "/dashboard/hod/applications",
        },
        {
          id: "examination-decisions",
          label: "Examination Decisions",
          description: "Confirm examiners and record viva outcomes.",
          href: "/dashboard/hod/examinations",
        },
        {
          id: "completion-decisions",
          label: "Completion Decisions",
          description: "Approve corrections and programme completion.",
          href: "/dashboard/hod/completions",
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
      attentionItems: [],
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
  ] = await prisma.$transaction([
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
    subtitle: "See where you are now and what should happen next.",
    attentionItems: [
      ...(overdueReports > 0
        ? [
            buildAttentionItem(
              "student-overdue-reports",
              "Overdue progress reports",
              overdueReports,
              "Submit or correct these reports to keep your record up to date.",
              "/dashboard/student/progress-reports",
              "danger",
            ),
          ]
        : []),
      ...(activeProposalReviews > 0
        ? [
            buildAttentionItem(
              "student-proposal-review",
              "Proposal review in progress",
              activeProposalReviews,
              "Follow the review status and respond if a revision is requested.",
              "/dashboard/student/proposals",
              "info",
            ),
          ]
        : []),
      ...(openThesisMilestones > 0
        ? [
            buildAttentionItem(
              "student-thesis-work",
              "Active thesis milestones",
              openThesisMilestones,
              "Continue the thesis work currently moving through review.",
              "/dashboard/student/theses/submit",
              "warning",
            ),
          ]
        : []),
    ],
    journey: buildStudentJourney({
      academicStatus: student.academicStatus,
      activeRegistrations,
      activeProposalReviews,
      activeEthicsApprovals,
      openThesisMilestones,
    }),
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
        "Ethics document packages submitted for your record.",
        activeEthicsApprovals > 0 ? "Submitted" : "Not submitted",
        activeEthicsApprovals > 0 ? "success" : "neutral",
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
      attentionItems: [],
      cards: [],
      quickActions: getQuickActions("supervisor"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [
    assignedStudents,
    monitoredProposals,
    submittedProgressReports,
    graduatedStudents,
  ] =
    await prisma.$transaction([
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
        },
      }),
      prisma.student.count({
        where: {
          academicStatus: AcademicStatus.GRADUATED,
          supervisorAssignments: {
            some: {
              supervisorId: supervisor.id,
            },
          },
        },
      }),
    ]);

  return {
    role: "supervisor",
    roleLabel: "Supervisor",
    title: "Supervisor Overview",
    subtitle: "Keep student supervision and active academic work moving.",
    attentionItems: [
      ...(monitoredProposals > 0
        ? [
            buildAttentionItem(
              "supervisor-proposals",
              "Proposals under review",
              monitoredProposals,
              "Check the proposal work currently active across your students.",
              "/dashboard/supervisor/proposals/evaluate",
              "warning",
            ),
          ]
        : []),
      ...(submittedProgressReports > 0
        ? [
            buildAttentionItem(
              "supervisor-progress-reports",
              "Progress reports available",
              submittedProgressReports,
              "Review the reports submitted by your assigned students.",
              "/dashboard/supervisor/progress-reports",
              "info",
            ),
          ]
        : []),
    ],
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
        "Submitted Proposals",
        monitoredProposals,
        "Assigned student proposals currently in review.",
        monitoredProposals > 0 ? "Monitor" : "Clear",
        monitoredProposals > 0 ? "info" : "success",
      ),
      buildCard(
        "supervisor-unsigned-reports",
        "Submitted Reports",
        submittedProgressReports,
        "Progress reports available for view/download.",
        submittedProgressReports > 0 ? "Available" : "None",
        submittedProgressReports > 0 ? "info" : "neutral",
      ),
      buildCard(
        "supervisor-panels",
        "Graduated Students",
        graduatedStudents,
        "Assigned students marked as graduated.",
        graduatedStudents > 0 ? "Graduated" : "None",
        graduatedStudents > 0 ? "success" : "neutral",
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
      attentionItems: [],
      cards: [],
      quickActions: getQuickActions("examiner"),
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const [assignedTheses, scheduledVivas, pendingCorrections, activeExaminations] =
    await prisma.$transaction([
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
      prisma.correctionOrder.count({
        where: {
          status: "SUPERVISOR_CERTIFIED",
          requiresExaminerReview: true,
          thesis: {
            examinerAssignments: {
              some: {
                examinerId: examiner.id,
                status: "ACCEPTED",
                endedAt: null,
              },
            },
          },
          submissions: {
            some: {
              reviews: {
                none: {
                  reviewerUserId: auth.userId,
                  stage: "EXAMINER",
                },
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
              ThesisStatus.CORRECTIONS_APPROVED,
            ],
          },
        },
      }),
    ]);

  return {
    role: "examiner",
    roleLabel: "Examiner",
    title: "Examiner Overview",
    subtitle: "Stay focused on active examinations, vivas, and corrections.",
    attentionItems: [
      ...(pendingCorrections > 0
        ? [
            buildAttentionItem(
              "examiner-pending-corrections",
              "Corrections need review",
              pendingCorrections,
              "Review the Supervisor-certified correction submissions awaiting you.",
              "/dashboard/examiner/corrections",
              "warning",
            ),
          ]
        : []),
      ...(scheduledVivas > 0
        ? [
            buildAttentionItem(
              "examiner-scheduled-vivas",
              "Scheduled vivas",
              scheduledVivas,
              "Open your examination workspace and review the viva schedule.",
              "/dashboard/examiner/vivas",
              "info",
            ),
          ]
        : []),
    ],
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
  // Keep the metrics on one pooled connection. Parallel count queries can
  // exhaust a small serverless database pool before the dashboard renders.
  const [
    activeStaffAccounts,
    pendingApplications,
    archivedTheses,
    failedNotifications,
    ethicsDocumentSubmissions,
    overdueProgressReports,
    studentsUnderReview,
  ] =
    await prisma.$transaction([
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
            { status: ThesisStatus.ARCHIVED },
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
    subtitle: "Prioritize operational issues and keep department workflows moving.",
    attentionItems: [
      ...(failedNotifications > 0
        ? [
            buildAttentionItem(
              "admin-notification-failures",
              "Notification delivery failures",
              failedNotifications,
              "Inspect failed deliveries and recover messages that still need to be sent.",
              "/dashboard/admin/outbox",
              "danger",
            ),
          ]
        : []),
      ...(studentsUnderReview > 0
        ? [
            buildAttentionItem(
              "admin-students-under-review",
              "Students require academic review",
              studentsUnderReview,
              "Open department progress and follow up on flagged student records.",
              "/dashboard/admin/progress",
              "warning",
            ),
          ]
        : []),
      ...(overdueProgressReports > 0
        ? [
            buildAttentionItem(
              "admin-overdue-reports",
              "Progress reports are overdue",
              overdueProgressReports,
              "Review overdue reporting records and coordinate the required follow-up.",
              "/dashboard/admin/progress",
              "warning",
            ),
          ]
        : []),
      ...(pendingApplications > 0
        ? [
            buildAttentionItem(
              "admin-pending-applications",
              "Applications await review",
              pendingApplications,
              "Continue processing submitted applications and review work.",
              "/dashboard/admin/applications",
              "info",
            ),
          ]
        : []),
    ],
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
        "Ethics Documents",
        ethicsDocumentSubmissions,
        "Ethics document packages submitted by students.",
        ethicsDocumentSubmissions > 0 ? "Available" : "None",
        ethicsDocumentSubmissions > 0 ? "info" : "neutral",
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

async function buildHodSummary(): Promise<DashboardSummary> {
  const [
    pendingAdmissionDecisions,
    pendingReadiness,
    pendingExaminerConfirmations,
    orderedCorrections,
    pendingCompletions,
  ] = await prisma.$transaction([
    prisma.application.count({
      where: {
        isArchived: false,
        departmentDecision: "PENDING",
      },
    }),
    prisma.thesisReadinessCertification.count({
      where: { decision: "PENDING" },
    }),
    prisma.thesisExaminerAssignment.count({
      where: { status: "PENDING", confirmedAt: null },
    }),
    prisma.correctionOrder.count({
      where: {
        status: {
          in: [
            "ORDERED",
            "SUBMITTED",
            "RETURNED",
            "SUPERVISOR_CERTIFIED",
            "EXAMINER_APPROVED",
          ],
        },
      },
    }),
    prisma.programmeCompletion.count({
      where: { status: "PENDING" },
    }),
  ]);

  return {
    role: "hod",
    roleLabel: "Head of Department",
    title: "Department Decisions",
    subtitle:
      "Prioritize the decisions that move students through each academic gate.",
    attentionItems: [
      ...(pendingAdmissionDecisions > 0
        ? [
            buildAttentionItem(
              "hod-admission-decisions",
              "Admission decisions required",
              pendingAdmissionDecisions,
              "Review complete applications and record the department decision.",
              "/dashboard/hod/applications",
              "warning",
            ),
          ]
        : []),
      ...(pendingReadiness > 0
        ? [
            buildAttentionItem(
              "hod-readiness-decisions",
              "Readiness reviews pending",
              pendingReadiness,
              "Review thesis readiness records awaiting department action.",
              "/dashboard/hod/examinations",
              "warning",
            ),
          ]
        : []),
      ...(pendingExaminerConfirmations > 0
        ? [
            buildAttentionItem(
              "hod-examiner-confirmations",
              "Examiner confirmations pending",
              pendingExaminerConfirmations,
              "Confirm the proposed examiner assignments for active theses.",
              "/dashboard/hod/examinations",
              "warning",
            ),
          ]
        : []),
      ...(pendingCompletions > 0
        ? [
            buildAttentionItem(
              "hod-completion-approvals",
              "Completion approvals required",
              pendingCompletions,
              "Review eligible programme completions and record the final decision.",
              "/dashboard/hod/completions",
              "warning",
            ),
          ]
        : []),
    ],
    cards: [
      buildCard(
        "hod-admissions",
        "Admission Decisions",
        pendingAdmissionDecisions,
        "Applications awaiting a Department decision.",
        pendingAdmissionDecisions ? "Decision required" : "Clear",
        pendingAdmissionDecisions ? "warning" : "success",
      ),
      buildCard(
        "hod-readiness",
        "Readiness Reviews",
        pendingReadiness,
        "Thesis readiness records awaiting certification.",
        pendingReadiness ? "Review required" : "Clear",
        pendingReadiness ? "warning" : "success",
      ),
      buildCard(
        "hod-examiners",
        "Examiner Confirmations",
        pendingExaminerConfirmations,
        "Exact thesis examiner assignments awaiting confirmation.",
        pendingExaminerConfirmations ? "Confirm assignments" : "Clear",
        pendingExaminerConfirmations ? "warning" : "success",
      ),
      buildCard(
        "hod-corrections",
        "Correction Orders",
        orderedCorrections,
        "Ordered corrections still in progress.",
        orderedCorrections ? "In progress" : "None",
        orderedCorrections ? "info" : "neutral",
      ),
      buildCard(
        "hod-completions",
        "Completion Approvals",
        pendingCompletions,
        "Programme completions awaiting HOD approval.",
        pendingCompletions ? "Approval required" : "Clear",
        pendingCompletions ? "warning" : "success",
      ),
    ],
    quickActions: getQuickActions("hod"),
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
    case "hod":
      return buildHodSummary();
  }
}

