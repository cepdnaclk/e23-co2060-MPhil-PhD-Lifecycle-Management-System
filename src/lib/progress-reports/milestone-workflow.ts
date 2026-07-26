import {
  MilestoneStatus,
  ProgressSubmissionStatus,
  UserRole,
} from "@prisma/client";

import {
  appendLifecycleEvent,
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class MilestoneProgressError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MilestoneProgressError";
    this.status = status;
  }
}

export async function submitMilestoneProgress(
  milestoneId: string,
  input: { narrative: string; changeSummary?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new MilestoneProgressError(
      "Only the milestone owner can submit progress.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const milestone = await tx.studentMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        student: {
          select: {
            id: true,
            userId: true,
            supervisorAssignments: {
              where: { isPrimary: true, effectiveTo: null },
              take: 1,
              select: { supervisorUserId: true },
            },
          },
        },
        progressReport: true,
      },
    });

    if (!milestone) {
      throw new MilestoneProgressError("Milestone not found.", 404);
    }

    if (milestone.student.userId !== auth.userId) {
      throw new MilestoneProgressError(
        "This milestone belongs to another student.",
        403,
      );
    }

    if (
      milestone.status === MilestoneStatus.APPROVED ||
      milestone.status === MilestoneStatus.WAIVED
    ) {
      throw new MilestoneProgressError("This milestone is closed.", 409);
    }

    if (
      milestone.progressReport &&
      milestone.progressReport.status !== ProgressSubmissionStatus.RETURNED
    ) {
      throw new MilestoneProgressError(
        "A returned report is required before resubmission.",
        409,
      );
    }

    const now = new Date();
    const versionNumber = (milestone.progressReport?.currentVersion ?? 0) + 1;
    const report = milestone.progressReport
      ? await tx.progressReport.update({
          where: { id: milestone.progressReport.id },
          data: {
            narrative: input.narrative,
            status: ProgressSubmissionStatus.SUBMITTED,
            currentVersion: versionNumber,
            submittedAt: now,
            returnedAt: null,
            returnedByUserId: null,
            returnReason: null,
            versions: {
              create: {
                versionNumber,
                narrative: input.narrative,
                changeSummary: input.changeSummary,
                submittedByUserId: auth.userId,
              },
            },
          },
        })
      : await tx.progressReport.create({
          data: {
            studentId: milestone.student.id,
            milestoneId: milestone.id,
            periodLabel: `Milestone ${milestone.sequenceNumber}`,
            narrative: input.narrative,
            status: ProgressSubmissionStatus.SUBMITTED,
            currentVersion: 1,
            submittedAt: now,
            isOverdue: milestone.dueDate < now,
            versions: {
              create: {
                versionNumber: 1,
                narrative: input.narrative,
                submittedByUserId: auth.userId,
              },
            },
          },
        });

    await tx.studentMilestone.update({
      where: { id: milestone.id },
      data: { status: MilestoneStatus.SUBMITTED },
    });
    const primarySupervisor =
      milestone.student.supervisorAssignments[0]?.supervisorUserId;
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `progress-report:${report.id}:version:${versionNumber}:submitted`,
        eventType: LIFECYCLE_EVENT.PROGRESS_SUBMITTED,
        aggregateType: "ProgressReport",
        aggregateId: report.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: milestone.progressReport?.status ?? "NOT_SUBMITTED",
        newState: ProgressSubmissionStatus.SUBMITTED,
        metadata: { milestoneId: milestone.id, versionNumber },
      },
      primarySupervisor
        ? [
            {
              eventKey: `progress-report:${report.id}:version:${versionNumber}:notify:${primarySupervisor}`,
              recipientId: primarySupervisor,
              studentId: milestone.student.id,
              notificationEvent: "PROGRESS_REPORT_SUBMITTED",
              title: `Milestone ${milestone.sequenceNumber} progress submitted`,
              message: "A milestone progress report is ready for your decision.",
              actionUrl: "/dashboard/supervisor/progress-reports",
            },
          ]
        : [],
    );

    return report;
  });
}

export async function decideMilestoneProgress(
  progressReportId: string,
  input:
    | { decision: "RETURN"; reason: string }
    | { decision: "APPROVE"; reason?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.SUPERVISOR) {
    throw new MilestoneProgressError(
      "Only the active primary supervisor can decide progress.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const report = await tx.progressReport.findUnique({
      where: { id: progressReportId },
      include: {
        milestone: true,
        student: {
          select: {
            id: true,
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

    if (!report) {
      throw new MilestoneProgressError("Progress report not found.", 404);
    }

    if (report.student.supervisorAssignments.length !== 1) {
      throw new MilestoneProgressError(
        "You are not the active primary supervisor for this student.",
        403,
      );
    }

    if (
      report.status !== ProgressSubmissionStatus.SUBMITTED ||
      !report.milestone
    ) {
      throw new MilestoneProgressError(
        "Only a submitted milestone report can be decided.",
        409,
      );
    }

    const returned = input.decision === "RETURN";
    const now = new Date();
    const status = returned
      ? ProgressSubmissionStatus.RETURNED
      : ProgressSubmissionStatus.APPROVED;
    const updated = await tx.progressReport.update({
      where: { id: report.id },
      data: returned
        ? {
            status,
            returnedAt: now,
            returnedByUserId: auth.userId,
            returnReason: input.reason,
          }
        : {
            status,
            approvedAt: now,
            approvedByUserId: auth.userId,
          },
    });
    await tx.studentMilestone.update({
      where: { id: report.milestone.id },
      data: {
        status: returned ? MilestoneStatus.RETURNED : MilestoneStatus.APPROVED,
        completedAt: returned ? null : now,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `progress-report:${report.id}:version:${report.currentVersion}:${returned ? "returned" : "approved"}`,
      eventType: returned
        ? LIFECYCLE_EVENT.PROGRESS_RETURNED
        : LIFECYCLE_EVENT.PROGRESS_APPROVED,
      aggregateType: "ProgressReport",
      aggregateId: report.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: ProgressSubmissionStatus.SUBMITTED,
      newState: status,
      metadata: returned ? { reason: input.reason } : undefined,
    });

    return updated;
  });
}
