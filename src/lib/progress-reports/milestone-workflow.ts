import {
  AcademicStatus,
  DocumentType,
  DocumentVerificationStatus,
  MilestoneStatus,
  ProgressSubmissionStatus,
  RegistrationStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import {
  appendLifecycleEvent,
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import {
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
  type VerifiedUploadSession,
} from "@/lib/uploads/sessions";
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
  input: {
    narrative: string;
    changeSummary?: string;
    uploadSessionId?: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new MilestoneProgressError(
      "Only the milestone owner can submit progress.",
      403,
    );
  }

  let verifiedSession: VerifiedUploadSession | null = null;
  if (input.uploadSessionId) {
    try {
      const verification = await verifyUploadSessionForFinalize(
        input.uploadSessionId,
        UploadPurpose.PROGRESS_REPORT,
        auth,
      );
      if (verification.state === "FINALIZED") {
        const existing = await prisma.progressReport.findUnique({
          where: { id: verification.finalizedEntityId },
        });
        if (!existing) {
          throw new MilestoneProgressError(
            "Finalized progress report could not be loaded.",
            500,
          );
        }
        return existing;
      }
      verifiedSession = verification.session;
    } catch (error) {
      if (error instanceof UploadSessionError) {
        throw new MilestoneProgressError(error.message, error.status);
      }
      throw error;
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
    const milestone = await tx.studentMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        student: {
          select: {
            id: true,
            userId: true,
            academicStatus: true,
            registrations: {
              where: {
                status: RegistrationStatus.ACTIVE,
                expirationDate: { gte: new Date() },
              },
              take: 1,
              select: { id: true },
            },
            milestones: {
              select: { sequenceNumber: true, status: true },
            },
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
      milestone.student.academicStatus !== AcademicStatus.ACTIVE ||
      milestone.student.registrations.length !== 1
    ) {
      throw new MilestoneProgressError(
        "An active Student record and fixed-term registration are required.",
        409,
      );
    }

    if (
      milestone.student.milestones.some(
        (candidate) =>
          candidate.sequenceNumber < milestone.sequenceNumber &&
          candidate.status !== MilestoneStatus.APPROVED &&
          candidate.status !== MilestoneStatus.WAIVED,
      )
    ) {
      throw new MilestoneProgressError(
        "Earlier fixed milestones must be completed first.",
        409,
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
    const versionId = randomUUID();
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
                id: versionId,
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
                id: versionId,
                versionNumber: 1,
                narrative: input.narrative,
                submittedByUserId: auth.userId,
              },
            },
          },
        });

    if (verifiedSession) {
      const documentIds = verifiedSession.files.map(() => randomUUID());
      await Promise.all(
        verifiedSession.files.map((document, index) =>
          tx.document.create({
            data: {
              id: documentIds[index],
              documentType: DocumentType.PROGRESS_REPORT,
              studentId: milestone.student.id,
              progressReportId: report.id,
              progressReportVersionId: versionId,
              fileName: document.fileName,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              checksumSha256: document.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: now,
              version: versionNumber,
              isCurrentVersion: true,
            },
          }),
        ),
      );
      await tx.document.updateMany({
        where: {
          progressReportId: report.id,
          progressReportVersionId: { not: versionId },
        },
        data: { isCurrentVersion: false },
      });
      for (const [index, file] of verifiedSession.files.entries()) {
        await tx.stagedUploadFile.update({
          where: { id: file.id },
          data: { documentId: documentIds[index] },
        });
      }
      await tx.uploadSession.update({
        where: { id: verifiedSession.id },
        data: {
          status: UploadSessionStatus.FINALIZED,
          finalizedAt: now,
          finalizedEntityId: report.id,
          result: {
            milestoneId: milestone.id,
            versionNumber,
            documentCount: verifiedSession.files.length,
          },
        },
      });
    }

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
  } catch (error) {
    if (verifiedSession) {
      await reopenUploadSessionAfterFinalizeFailure(
        verifiedSession.id,
        error instanceof Error ? error.message : "Progress finalization failed.",
      );
    }
    if (error instanceof MilestoneProgressError) {
      throw error;
    }
    throw new MilestoneProgressError(
      error instanceof Error ? error.message : "Unable to submit progress.",
      500,
    );
  }
}

export async function listStudentMilestones(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.STUDENT) {
    throw new MilestoneProgressError(
      "Only a Student can view their milestones.",
      403,
    );
  }

  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      academicStatus: true,
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
          expirationDate: { gte: new Date() },
        },
        take: 1,
        select: { id: true },
      },
      milestones: {
        orderBy: { sequenceNumber: "asc" },
        select: {
          id: true,
          sequenceNumber: true,
          dueDate: true,
          status: true,
          completedAt: true,
          progressReport: {
            select: {
              id: true,
              status: true,
              currentVersion: true,
              submittedAt: true,
              returnReason: true,
              approvedAt: true,
              versions: {
                orderBy: { versionNumber: "desc" },
                select: {
                  id: true,
                  versionNumber: true,
                  narrative: true,
                  changeSummary: true,
                  submittedAt: true,
                  documents: {
                    where: { isDeleted: false },
                    select: {
                      id: true,
                      fileName: true,
                      mimeType: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!student) {
    throw new MilestoneProgressError("Student profile not found.", 404);
  }

  const isActive =
    student.academicStatus === AcademicStatus.ACTIVE &&
    student.registrations.length === 1;
  if (!isActive) {
    throw new MilestoneProgressError(
      "An active Student record and fixed-term registration are required.",
      403,
    );
  }

  return {
    studentId: student.id,
    isActive,
    milestones: student.milestones,
  };
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
