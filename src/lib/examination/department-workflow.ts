import {
  AssignmentStatus,
  ExaminerRecommendation,
  ReadinessDecision,
  UserRole,
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

export async function certifyThesisReadiness(
  thesisId: string,
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
    const thesis = await tx.thesis.findUnique({
      where: { id: thesisId },
      select: {
        id: true,
        studentId: true,
        student: {
          select: {
            supervisorAssignments: {
              where: {
                isPrimary: true,
                effectiveTo: null,
                supervisorUserId: auth.userId,
              },
              take: 1,
              select: { id: true },
            },
            milestones: {
              select: { status: true },
            },
          },
        },
        readinessCertification: true,
      },
    });

    if (!thesis) {
      throw new DepartmentExaminationError("Thesis not found.", 404);
    }

    if (thesis.student.supervisorAssignments.length !== 1) {
      throw new DepartmentExaminationError(
        "You are not the active primary supervisor.",
        403,
      );
    }

    if (
      input.decision === ReadinessDecision.CERTIFIED &&
      (thesis.student.milestones.length === 0 ||
        thesis.student.milestones.some(
          (milestone) => milestone.status !== "APPROVED",
        ))
    ) {
      throw new DepartmentExaminationError(
        "Every scheduled progress milestone must be approved.",
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
      await assertEthicsGateSatisfied(tx as never, thesis.studentId);
    }

    const certification = thesis.readinessCertification
      ? await tx.thesisReadinessCertification.update({
          where: { id: thesis.readinessCertification.id },
          data: {
            decision: input.decision,
            checklist: input.checklist,
            comments: input.comments,
            certifiedByUserId: auth.userId,
            decidedAt: new Date(),
          },
        })
      : await tx.thesisReadinessCertification.create({
          data: {
            thesisId: thesis.id,
            studentId: thesis.studentId,
            decision: input.decision,
            checklist: input.checklist,
            comments: input.comments,
            certifiedByUserId: auth.userId,
            decidedAt: new Date(),
          },
        });
    await appendLifecycleEvent(tx as never, {
      eventKey: `thesis:${thesis.id}:readiness:${input.decision.toLowerCase()}:${Date.now()}`,
      eventType: LIFECYCLE_EVENT.THESIS_READINESS_CERTIFIED,
      aggregateType: "Thesis",
      aggregateId: thesis.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState:
        thesis.readinessCertification?.decision ?? ReadinessDecision.PENDING,
      newState: input.decision,
    });

    return certification;
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
      ReadinessDecision.CERTIFIED
    ) {
      throw new DepartmentExaminationError(
        "Thesis readiness must be certified first.",
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
