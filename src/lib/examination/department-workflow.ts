import {
  AcademicStatus,
  AssignmentStatus,
  ExaminerRecommendation,
  MilestoneStatus,
  ProposalStatus,
  ReadinessDecision,
  RegistrationStatus,
  ThesisStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import {
  appendLifecycleEvent,
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { assertEthicsGateSatisfied } from "@/lib/ethics/department-record";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentExaminationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentExaminationError";
    this.status = status;
  }
}

async function assertReadinessPreconditions(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      academicStatus: true,
      userId: true,
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
        },
        take: 1,
        select: { id: true },
      },
      researchProposals: {
        where: { status: ProposalStatus.APPROVED, isArchived: false },
        take: 1,
        select: { id: true },
      },
      milestones: {
        select: { status: true },
      },
      supervisorAssignments: {
        where: {
          isPrimary: true,
          effectiveTo: null,
          supervisor: { user: { isActive: true } },
        },
        take: 2,
        select: { supervisorUserId: true },
      },
      theses: {
        where: { status: { in: ["ARCHIVED", "CLOSED"] } },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!student) {
    throw new DepartmentExaminationError("Student profile not found.", 404);
  }
  if (student.academicStatus !== AcademicStatus.ACTIVE) {
    throw new DepartmentExaminationError(
      "The Student must have active academic status.",
      409,
    );
  }
  if (student.registrations.length !== 1) {
    throw new DepartmentExaminationError(
      "An active fixed-term registration is required.",
      409,
    );
  }
  if (student.researchProposals.length !== 1) {
    throw new DepartmentExaminationError(
      "An approved proposal is required.",
      409,
    );
  }
  if (
    student.milestones.length === 0 ||
    student.milestones.some(
      (milestone) => milestone.status !== MilestoneStatus.APPROVED,
    )
  ) {
    throw new DepartmentExaminationError(
      "Every scheduled progress milestone must be approved.",
      409,
    );
  }
  if (student.supervisorAssignments.length !== 1) {
    throw new DepartmentExaminationError(
      "Exactly one active primary Supervisor is required.",
      409,
    );
  }
  if (student.theses.length > 0) {
    throw new DepartmentExaminationError(
      "A completed thesis already exists for this Student.",
      409,
    );
  }
  await assertEthicsGateSatisfied(tx as never, student.id);
  return {
    studentId: student.id,
    studentUserId: student.userId,
    primarySupervisorUserId:
      student.supervisorAssignments[0].supervisorUserId,
  };
}

export async function requestThesisReadiness(
  input: { studentMessage?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new DepartmentExaminationError(
      "Only a Student can request thesis readiness.",
      403,
    );
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { userId: auth.userId },
      select: { id: true, readinessCertifications: { take: 1 } },
    });
    if (!student) {
      throw new DepartmentExaminationError("Student profile not found.", 404);
    }
    const gate = await assertReadinessPreconditions(tx as never, student.id);
    const existing = student.readinessCertifications[0];
    if (
      existing?.decision === ReadinessDecision.CERTIFIED ||
      existing?.decision === ReadinessDecision.HOD_APPROVED
    ) {
      throw new DepartmentExaminationError(
        "The readiness request has already advanced beyond Student action.",
        409,
      );
    }
    const readiness = existing
      ? await tx.thesisReadinessCertification.update({
          where: { id: existing.id },
          data: {
            decision: ReadinessDecision.REQUESTED,
            studentMessage: input.studentMessage,
            certifiedByUserId: null,
            checklist: undefined,
            supervisorNotes: null,
            certifiedAt: null,
            hodApprovedByUserId: null,
            hodNotes: null,
            hodApprovedAt: null,
            decidedAt: new Date(),
          },
        })
      : await tx.thesisReadinessCertification.create({
          data: {
            studentId: student.id,
            decision: ReadinessDecision.REQUESTED,
            studentMessage: input.studentMessage,
            decidedAt: new Date(),
          },
        });
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `thesis-readiness:${readiness.id}:requested:${readiness.updatedAt.toISOString()}`,
        eventType: LIFECYCLE_EVENT.THESIS_READINESS_REQUESTED,
        aggregateType: "ThesisReadinessCertification",
        aggregateId: readiness.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: existing?.decision ?? ReadinessDecision.PENDING,
        newState: ReadinessDecision.REQUESTED,
      },
      [
        {
          eventKey: `thesis-readiness:${readiness.id}:requested:notify:${gate.primarySupervisorUserId}`,
          recipientId: gate.primarySupervisorUserId,
          studentId: student.id,
          notificationEvent: "THESIS_STATUS_CHANGED",
          title: "Thesis readiness requested",
          message: "A Student is ready for your thesis-readiness decision.",
          actionUrl: "/dashboard/supervisor/progress-reports",
        },
      ],
    );
    return readiness;
  });
}

export async function certifyThesisReadiness(
  readinessId: string,
  input: {
    decision: "CERTIFIED" | "RETURNED";
    checklist: Record<string, boolean>;
    comments?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.SUPERVISOR) {
    throw new DepartmentExaminationError(
      "Only the active primary supervisor can certify thesis readiness.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const readiness = await tx.thesisReadinessCertification.findUnique({
      where: { id: readinessId },
      include: {
        student: {
          select: {
            userId: true,
            supervisorAssignments: {
              where: {
                isPrimary: true,
                effectiveTo: null,
                supervisorUserId: auth.userId,
              },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    if (!readiness) {
      throw new DepartmentExaminationError(
        "Thesis-readiness request not found.",
        404,
      );
    }

    if (readiness.student.supervisorAssignments.length !== 1) {
      throw new DepartmentExaminationError(
        "You are not the active primary supervisor.",
        403,
      );
    }

    if (
      readiness.decision !== ReadinessDecision.REQUESTED
    ) {
      throw new DepartmentExaminationError(
        "Only a requested readiness record can be decided by the Supervisor.",
        409,
      );
    }

    if (
      input.decision === ReadinessDecision.CERTIFIED &&
      Object.values(input.checklist).some((value) => !value)
    ) {
      throw new DepartmentExaminationError(
        "Every readiness checklist item must be satisfied.",
        409,
      );
    }

    if (input.decision === ReadinessDecision.CERTIFIED) {
      await assertReadinessPreconditions(tx as never, readiness.studentId);
    }

    const certification = await tx.thesisReadinessCertification.update({
      where: { id: readiness.id },
      data: {
        decision: input.decision,
        checklist: input.checklist,
        supervisorNotes: input.comments,
        certifiedByUserId: auth.userId,
        certifiedAt:
          input.decision === ReadinessDecision.CERTIFIED ? new Date() : null,
        decidedAt: new Date(),
      },
    });
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `thesis-readiness:${readiness.id}:supervisor:${input.decision.toLowerCase()}:${certification.updatedAt.toISOString()}`,
        eventType: LIFECYCLE_EVENT.THESIS_READINESS_CERTIFIED,
        aggregateType: "ThesisReadinessCertification",
        aggregateId: readiness.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: readiness.decision,
        newState: input.decision,
      },
      [
        {
          eventKey: `thesis-readiness:${readiness.id}:supervisor:${input.decision.toLowerCase()}:notify:${readiness.student.userId}`,
          recipientId: readiness.student.userId,
          studentId: readiness.studentId,
          notificationEvent: "THESIS_STATUS_CHANGED",
          title:
            input.decision === ReadinessDecision.CERTIFIED
              ? "Thesis readiness certified"
              : "Thesis readiness returned",
          message:
            input.comments ??
            "Your primary Supervisor recorded a thesis-readiness decision.",
          actionUrl: "/dashboard/student/theses/submit",
        },
      ],
    );

    return certification;
  });
}

export async function recordHodReadinessDecision(
  readinessId: string,
  input: {
    decision: "APPROVED" | "RETURNED";
    notes?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new DepartmentExaminationError(
      "Only the Head of Department can approve examination readiness.",
      403,
    );
  }
  return prisma.$transaction(async (tx) => {
    const readiness = await tx.thesisReadinessCertification.findUnique({
      where: { id: readinessId },
      select: {
        id: true,
        studentId: true,
        decision: true,
        student: { select: { userId: true } },
      },
    });
    if (!readiness) {
      throw new DepartmentExaminationError(
        "Thesis-readiness record not found.",
        404,
      );
    }
    if (readiness.decision !== ReadinessDecision.CERTIFIED) {
      throw new DepartmentExaminationError(
        "Primary Supervisor certification is required first.",
        409,
      );
    }
    if (input.decision === "APPROVED") {
      await assertReadinessPreconditions(tx as never, readiness.studentId);
    }
    const nextDecision =
      input.decision === "APPROVED"
        ? ReadinessDecision.HOD_APPROVED
        : ReadinessDecision.RETURNED;
    const updated = await tx.thesisReadinessCertification.update({
      where: { id: readiness.id },
      data: {
        decision: nextDecision,
        hodApprovedByUserId: auth.userId,
        hodNotes: input.notes,
        hodApprovedAt:
          nextDecision === ReadinessDecision.HOD_APPROVED ? new Date() : null,
        decidedAt: new Date(),
      },
    });
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `thesis-readiness:${readiness.id}:hod:${nextDecision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.THESIS_READINESS_HOD_DECIDED,
        aggregateType: "ThesisReadinessCertification",
        aggregateId: readiness.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: readiness.decision,
        newState: nextDecision,
      },
      [
        {
          eventKey: `thesis-readiness:${readiness.id}:hod:${nextDecision.toLowerCase()}:notify:${readiness.student.userId}`,
          recipientId: readiness.student.userId,
          studentId: readiness.studentId,
          notificationEvent: "THESIS_STATUS_CHANGED",
          title:
            nextDecision === ReadinessDecision.HOD_APPROVED
              ? "Approved to submit thesis for examination"
              : "Thesis readiness returned by HOD",
          message:
            input.notes ??
            "The Head of Department recorded a thesis-readiness decision.",
          actionUrl: "/dashboard/student/theses/submit",
        },
      ],
    );
    return updated;
  });
}

export async function confirmThesisExaminerAssignment(
  assignmentId: string,
  decision: "ACCEPTED" | "DECLINED",
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new DepartmentExaminationError(
      "Only the Head of Department can confirm examiner assignments.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.thesisExaminerAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        thesis: {
          select: {
            id: true,
            studentId: true,
            title: true,
            readinessCertification: {
              select: { decision: true },
            },
          },
        },
        examiner: {
          select: { userId: true },
        },
      },
    });

    if (!assignment) {
      throw new DepartmentExaminationError("Examiner assignment not found.", 404);
    }

    if (
      assignment.thesis.readinessCertification?.decision !==
      ReadinessDecision.HOD_APPROVED
    ) {
      throw new DepartmentExaminationError(
        "Thesis readiness must be approved by the HOD first.",
        409,
      );
    }

    if (assignment.status !== AssignmentStatus.PENDING) {
      throw new DepartmentExaminationError(
        "Examiner assignment has already been decided.",
        409,
      );
    }

    const updated = await tx.thesisExaminerAssignment.update({
      where: { id: assignment.id },
      data: {
        status: decision,
        confirmedByHodUserId: auth.userId,
        confirmedAt: new Date(),
        endedAt: decision === AssignmentStatus.DECLINED ? new Date() : null,
      },
    });
    if (decision === AssignmentStatus.ACCEPTED) {
      await tx.thesis.update({
        where: { id: assignment.thesis.id },
        data: { status: ThesisStatus.UNDER_EXAMINATION },
      });
    }
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `thesis-examiner-assignment:${assignment.id}:hod:${decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.THESIS_EXAMINER_ASSIGNED,
        aggregateType: "ThesisExaminerAssignment",
        aggregateId: assignment.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: AssignmentStatus.PENDING,
        newState: decision,
      },
      decision === AssignmentStatus.ACCEPTED
        ? [
            {
              eventKey: `thesis-examiner-assignment:${assignment.id}:confirmed:notify:${assignment.examiner.userId}`,
              recipientId: assignment.examiner.userId,
              studentId: assignment.thesis.studentId,
              notificationEvent: "EXAMINER_REVIEW_ASSIGNED",
              title: "Thesis examination assignment confirmed",
              message: `The HOD confirmed your assignment for "${assignment.thesis.title}".`,
              actionUrl: "/dashboard/examiner/vivas",
            },
          ]
        : [],
    );

    return updated;
  });
}

export async function submitThesisExaminerReport(
  assignmentId: string,
  input: {
    recommendation: ExaminerRecommendation;
    reportText: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.EXAMINER) {
    throw new DepartmentExaminationError(
      "Only the assigned examiner can submit this report.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.thesisExaminerAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        examinerUserId: true,
        status: true,
        report: { select: { id: true } },
      },
    });

    if (!assignment) {
      throw new DepartmentExaminationError("Examiner assignment not found.", 404);
    }

    if (
      assignment.examinerUserId !== auth.userId ||
      assignment.status !== AssignmentStatus.ACCEPTED
    ) {
      throw new DepartmentExaminationError(
        "This confirmed assignment belongs to another examiner.",
        403,
      );
    }

    if (assignment.report) {
      throw new DepartmentExaminationError(
        "The examiner report has already been submitted.",
        409,
      );
    }

    const report = await tx.thesisExaminerReport.create({
      data: {
        assignmentId: assignment.id,
        authorUserId: auth.userId,
        recommendation: input.recommendation,
        reportText: input.reportText,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `thesis-examiner-assignment:${assignment.id}:report-submitted`,
      eventType: LIFECYCLE_EVENT.THESIS_REPORT_SUBMITTED,
      aggregateType: "ThesisExaminerAssignment",
      aggregateId: assignment.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: "REPORT_SUBMITTED",
      metadata: { recommendation: input.recommendation },
    });

    return report;
  });
}

export async function submitVivaRecommendation(
  vivaId: string,
  input: {
    recommendation: ExaminerRecommendation;
    rationale: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.EXAMINER) {
    throw new DepartmentExaminationError(
      "Only an assigned examiner can recommend a viva outcome.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const viva = await tx.viva.findUnique({
      where: { id: vivaId },
      select: {
        id: true,
        thesis: {
          select: {
            examinerAssignments: {
              where: {
                examinerUserId: auth.userId,
                status: AssignmentStatus.ACCEPTED,
              },
              take: 1,
              select: {
                id: true,
                report: { select: { id: true } },
                vivaRecommendation: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    const assignment = viva?.thesis.examinerAssignments[0];

    if (!viva || !assignment) {
      throw new DepartmentExaminationError(
        "No confirmed assignment exists for this viva.",
        403,
      );
    }

    if (!assignment.report) {
      throw new DepartmentExaminationError(
        "Submit the independent thesis report before the viva recommendation.",
        409,
      );
    }

    if (assignment.vivaRecommendation) {
      throw new DepartmentExaminationError(
        "The viva recommendation has already been submitted.",
        409,
      );
    }

    const recommendation = await tx.vivaRecommendation.create({
      data: {
        vivaId: viva.id,
        assignmentId: assignment.id,
        authorUserId: auth.userId,
        recommendation: input.recommendation,
        rationale: input.rationale,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `viva:${viva.id}:assignment:${assignment.id}:recommendation`,
      eventType: LIFECYCLE_EVENT.VIVA_RECOMMENDATION_SUBMITTED,
      aggregateType: "Viva",
      aggregateId: viva.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: "RECOMMENDATION_SUBMITTED",
      metadata: { recommendation: input.recommendation },
    });

    return recommendation;
  });
}

export async function recordHodVivaOutcome(
  vivaId: string,
  input: {
    outcome: ExaminerRecommendation;
    reason: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new DepartmentExaminationError(
      "Only the Head of Department can record the viva outcome.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const viva = await tx.viva.findUnique({
      where: { id: vivaId },
      select: {
        id: true,
        hodOutcome: true,
        thesis: {
          select: {
            examinerAssignments: {
              where: { status: AssignmentStatus.ACCEPTED },
              select: {
                report: { select: { id: true } },
                vivaRecommendation: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!viva) {
      throw new DepartmentExaminationError("Viva not found.", 404);
    }

    if (viva.hodOutcome) {
      throw new DepartmentExaminationError(
        "The HOD viva outcome has already been recorded.",
        409,
      );
    }

    const assignments = viva.thesis.examinerAssignments;
    if (
      assignments.length < 2 ||
      assignments.some(
        (assignment) => !assignment.report || !assignment.vivaRecommendation,
      )
    ) {
      throw new DepartmentExaminationError(
        "All confirmed examiners must submit independent reports and recommendations.",
        409,
      );
    }

    const updated = await tx.viva.update({
      where: { id: viva.id },
      data: {
        hodOutcome: input.outcome,
        hodDecisionByUserId: auth.userId,
        hodDecisionAt: new Date(),
        hodDecisionReason: input.reason,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `viva:${viva.id}:hod-outcome`,
      eventType: LIFECYCLE_EVENT.HOD_VIVA_OUTCOME_RECORDED,
      aggregateType: "Viva",
      aggregateId: viva.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: input.outcome,
      metadata: { reason: input.reason },
    });

    return updated;
  });
}
