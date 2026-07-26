import { randomUUID } from "node:crypto";

import {
  AssignmentStatus,
  CorrectionOrderStatus,
  CorrectionReviewDecision,
  CorrectionReviewStage,
  CorrectionType,
  DocumentType,
  DocumentVerificationStatus,
  ExaminerRecommendation,
  ThesisStatus,
  UploadPurpose,
  UploadSessionStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import {
  correctionUploadRequestSchema,
  orderedCorrectionSubmissionSchema,
  type CorrectionUploadRequest,
  type OrderedCorrectionSubmissionInput,
} from "@/lib/theses/schemas";
import {
  createStagedUploadSession,
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
} from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

export class CorrectionWorkflowError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "CorrectionWorkflowError";
    this.status = status;
  }
}

const activeCorrectionStatuses = [
  CorrectionOrderStatus.ORDERED,
  CorrectionOrderStatus.SUBMITTED,
  CorrectionOrderStatus.RETURNED,
  CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
  CorrectionOrderStatus.EXAMINER_APPROVED,
];

function cleanNotes(notes: string | undefined) {
  const value = notes?.trim();
  return value ? value : undefined;
}

async function listActiveRoleRecipients(
  tx: Prisma.TransactionClient,
  role: UserRole,
) {
  return tx.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
}

export async function orderVivaCorrections(
  vivaId: string,
  input: {
    requirementType: CorrectionType;
    requirements: string;
    dueDate?: Date;
    requiresExaminerReview?: boolean;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new CorrectionWorkflowError(
      "Only the Head of Department can order corrections.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const viva = await tx.viva.findUnique({
      where: { id: vivaId },
      include: {
        correctionOrders: {
          where: { status: { in: activeCorrectionStatuses } },
          select: { id: true },
        },
        thesis: {
          select: {
            id: true,
            studentId: true,
            student: {
              select: {
                userId: true,
                supervisorAssignments: {
                  where: { effectiveTo: null, isPrimary: true },
                  select: { supervisorUserId: true },
                  take: 1,
                },
              },
            },
            versions: {
              where: { isCurrent: true },
              take: 2,
              select: { id: true },
            },
            examinerAssignments: {
              where: {
                status: AssignmentStatus.ACCEPTED,
                endedAt: null,
              },
              select: { id: true, thesisVersionId: true },
            },
          },
        },
      },
    });

    if (!viva) {
      throw new CorrectionWorkflowError("Viva not found.", 404);
    }

    const expectedOutcome =
      input.requirementType === CorrectionType.MINOR
        ? ExaminerRecommendation.MINOR_CORRECTIONS
        : ExaminerRecommendation.MAJOR_CORRECTIONS;
    if (viva.hodOutcome !== expectedOutcome) {
      throw new CorrectionWorkflowError(
        "The correction type must match the recorded HOD viva outcome.",
        409,
      );
    }
    if (viva.correctionOrders.length > 0) {
      throw new CorrectionWorkflowError(
        "An active correction order already exists.",
        409,
      );
    }
    if (viva.thesis.versions.length !== 1) {
      throw new CorrectionWorkflowError(
        "Exactly one current thesis version is required before ordering corrections.",
        409,
      );
    }

    const originatingVersionId = viva.thesis.versions[0].id;
    const requiresExaminerReview =
      input.requirementType === CorrectionType.MAJOR ||
      input.requiresExaminerReview === true;
    const eligibleExaminers = viva.thesis.examinerAssignments.filter(
      (assignment) => assignment.thesisVersionId === originatingVersionId,
    );
    if (requiresExaminerReview && eligibleExaminers.length === 0) {
      throw new CorrectionWorkflowError(
        "At least one accepted Examiner assigned to the originating thesis version is required.",
        409,
      );
    }

    const order = await tx.correctionOrder.create({
      data: {
        vivaId: viva.id,
        thesisId: viva.thesis.id,
        originatingThesisVersionId: originatingVersionId,
        orderedByHodUserId: auth.userId,
        requirementType: input.requirementType,
        requiresExaminerReview,
        requirements: input.requirements.trim(),
        dueDate: input.dueDate,
      },
    });
    await tx.thesis.update({
      where: { id: viva.thesis.id },
      data: { status: ThesisStatus.CORRECTIONS_REQUIRED },
    });

    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `correction-order:${order.id}:ordered`,
        eventType: LIFECYCLE_EVENT.CORRECTIONS_ORDERED,
        aggregateType: "CorrectionOrder",
        aggregateId: order.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        newState: CorrectionOrderStatus.ORDERED,
        metadata: {
          requirementType: input.requirementType,
          originatingThesisVersionId: originatingVersionId,
          requiresExaminerReview,
        },
      },
      [
        {
          eventKey: `correction-order:${order.id}:ordered:student`,
          recipientId: viva.thesis.student.userId,
          studentId: viva.thesis.studentId,
          notificationEvent: "CORRECTIONS_REQUIRED",
          title: "Thesis corrections ordered",
          message: `The HOD ordered ${input.requirementType.toLowerCase()} corrections.`,
          actionUrl: "/dashboard/student/theses/corrections",
        },
      ],
    );

    return order;
  });
}

async function requireStudentCorrectionOrder(
  correctionOrderId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new CorrectionWorkflowError(
      "Only the Student can submit ordered corrections.",
      403,
    );
  }

  const order = await prisma.correctionOrder.findUnique({
    where: { id: correctionOrderId },
    select: {
      id: true,
      thesisId: true,
      status: true,
      thesis: {
        select: {
          status: true,
          isArchived: true,
          student: {
            select: {
              id: true,
              userId: true,
              isArchived: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new CorrectionWorkflowError("Correction order not found.", 404);
  }
  if (order.thesis.student.userId !== auth.userId) {
    throw new CorrectionWorkflowError(
      "This correction order belongs to another Student.",
      403,
    );
  }
  if (order.thesis.isArchived || order.thesis.student.isArchived) {
    throw new CorrectionWorkflowError(
      "Archived Student records are read-only.",
      403,
    );
  }
  if (order.thesis.status !== ThesisStatus.CORRECTIONS_REQUIRED) {
    throw new CorrectionWorkflowError(
      "The thesis is not accepting correction submissions.",
      409,
    );
  }
  if (
    order.status !== CorrectionOrderStatus.ORDERED &&
    order.status !== CorrectionOrderStatus.RETURNED
  ) {
    throw new CorrectionWorkflowError(
      "This correction order is not open for submission.",
      409,
    );
  }

  return order;
}

export async function createOrderedCorrectionUploadUrl(
  correctionOrderId: string,
  input: CorrectionUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = correctionUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new CorrectionWorkflowError(
      parsed.error.issues[0]?.message ?? "Invalid correction upload request.",
      400,
    );
  }

  const order = await requireStudentCorrectionOrder(correctionOrderId, auth);
  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.CORRECTION,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      `${order.thesis.student.id}/${order.thesisId}/${order.id}`,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new CorrectionWorkflowError(error.message, error.status);
    }
    throw error;
  }
}

export async function submitOrderedCorrections(
  correctionOrderId: string,
  input: OrderedCorrectionSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = orderedCorrectionSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    throw new CorrectionWorkflowError(
      parsed.error.issues[0]?.message ?? "Invalid correction submission.",
      400,
    );
  }

  await requireStudentCorrectionOrder(correctionOrderId, auth);
  let verification;
  try {
    verification = await verifyUploadSessionForFinalize(
      parsed.data.uploadSessionId,
      UploadPurpose.CORRECTION,
      auth,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new CorrectionWorkflowError(error.message, error.status);
    }
    throw error;
  }

  if (verification.state === "FINALIZED") {
    const existing = await prisma.correctionSubmission.findUnique({
      where: { id: verification.finalizedEntityId },
      include: {
        documents: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!existing) {
      throw new CorrectionWorkflowError(
        "Finalized correction submission could not be loaded.",
        500,
      );
    }
    return existing;
  }

  const verifiedSession = verification.session;
  const submissionId = randomUUID();
  const thesisVersionId = randomUUID();
  const documentIds = verifiedSession.files.map(() => randomUUID());

  try {
    await withSerializableRetry(async (tx) => {
      const order = await tx.correctionOrder.findUnique({
        where: { id: correctionOrderId },
        include: {
          thesis: {
            select: {
              id: true,
              status: true,
              student: {
                select: {
                  id: true,
                  userId: true,
                  supervisorAssignments: {
                    where: { effectiveTo: null, isPrimary: true },
                    select: { supervisorUserId: true },
                    take: 1,
                  },
                },
              },
            },
          },
          submissions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { versionNumber: true },
          },
        },
      });
      if (!order) {
        throw new CorrectionWorkflowError("Correction order not found.", 404);
      }
      if (order.thesis.student.userId !== auth.userId) {
        throw new CorrectionWorkflowError(
          "This correction order belongs to another Student.",
          403,
        );
      }
      if (
        order.thesis.status !== ThesisStatus.CORRECTIONS_REQUIRED ||
        (order.status !== CorrectionOrderStatus.ORDERED &&
          order.status !== CorrectionOrderStatus.RETURNED)
      ) {
        throw new CorrectionWorkflowError(
          "This correction order is no longer open for submission.",
          409,
        );
      }
      if (!order.originatingThesisVersionId) {
        throw new CorrectionWorkflowError(
          "The correction order is not bound to an originating thesis version.",
          409,
        );
      }

      const latestThesisVersion = await tx.thesisVersion.aggregate({
        where: { thesisId: order.thesis.id },
        _max: { versionNumber: true },
      });
      const versionNumber = (order.submissions[0]?.versionNumber ?? 0) + 1;
      const thesisVersionNumber =
        (latestThesisVersion._max.versionNumber ?? 0) + 1;
      const now = new Date();

      await tx.thesisVersion.updateMany({
        where: { thesisId: order.thesis.id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.document.updateMany({
        where: {
          thesisId: order.thesis.id,
          isCurrentVersion: true,
          isDeleted: false,
        },
        data: { isCurrentVersion: false },
      });
      await tx.thesisVersion.create({
        data: {
          id: thesisVersionId,
          thesisId: order.thesis.id,
          versionNumber: thesisVersionNumber,
          isCurrent: true,
          manifestHash: verifiedSession.manifestHash,
          submittedByUserId: auth.userId,
        },
      });
      await tx.correctionSubmission.create({
        data: {
          id: submissionId,
          correctionOrderId: order.id,
          revisedThesisVersionId: thesisVersionId,
          versionNumber,
          responseSummary: parsed.data.responseSummary,
          manifestHash: verifiedSession.manifestHash,
          submittedByUserId: auth.userId,
        },
      });

      for (const [index, document] of verifiedSession.files.entries()) {
        await tx.document.create({
          data: {
            id: documentIds[index],
            studentId: order.thesis.student.id,
            thesisId: order.thesis.id,
            thesisVersionId,
            correctionSubmissionId: submissionId,
            documentType: DocumentType.CORRECTION,
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
        });
      }
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
          finalizedEntityId: submissionId,
          result: {
            correctionOrderId: order.id,
            versionNumber,
            thesisVersionId,
            thesisVersionNumber,
            documentCount: verifiedSession.files.length,
          },
        },
      });
      await tx.correctionOrder.update({
        where: { id: order.id },
        data: {
          status: CorrectionOrderStatus.SUBMITTED,
          completionApprovedBy: null,
          completionApprovedAt: null,
          completionNotes: null,
        },
      });

      const primarySupervisorUserId =
        order.thesis.student.supervisorAssignments[0]?.supervisorUserId ?? null;
      await appendLifecycleEventAndEnqueue(
        tx,
        {
          eventKey: `correction-order:${order.id}:version:${versionNumber}:submitted`,
          eventType: LIFECYCLE_EVENT.CORRECTIONS_SUBMITTED,
          aggregateType: "CorrectionOrder",
          aggregateId: order.id,
          actorUserId: auth.userId,
          actorRole: auth.role,
          previousState: order.status,
          newState: CorrectionOrderStatus.SUBMITTED,
          metadata: {
            versionNumber,
            thesisVersionId,
            thesisVersionNumber,
            documentCount: verifiedSession.files.length,
          },
        },
        primarySupervisorUserId
          ? [
              {
                eventKey: `correction-order:${order.id}:version:${versionNumber}:supervisor`,
                recipientId: primarySupervisorUserId,
                studentId: order.thesis.student.id,
                notificationEvent: "CORRECTIONS_REQUIRED",
                title: "Corrections awaiting certification",
                message:
                  "A verified correction submission is ready for Supervisor review.",
                actionUrl: "/dashboard/supervisor/corrections",
              },
            ]
          : [],
      );
    });
  } catch (error) {
    await reopenUploadSessionAfterFinalizeFailure(
      verifiedSession.id,
      error instanceof Error ? error.message : "Correction finalization failed.",
    );
    throw error;
  }

  const submission = await prisma.correctionSubmission.findUnique({
    where: { id: submissionId },
    include: {
      documents: {
        where: { isDeleted: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!submission) {
    throw new CorrectionWorkflowError(
      "Submitted corrections could not be loaded.",
      500,
    );
  }
  return submission;
}

export async function reviewCorrectionsBySupervisor(
  correctionOrderId: string,
  input: { decision: "CERTIFY" | "RETURN"; notes?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.SUPERVISOR) {
    throw new CorrectionWorkflowError(
      "Only the active primary Supervisor can review corrections.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const order = await tx.correctionOrder.findUnique({
      where: { id: correctionOrderId },
      include: {
        thesis: {
          select: {
            studentId: true,
            student: {
              select: {
                userId: true,
                supervisorAssignments: {
                  where: {
                    supervisorUserId: auth.userId,
                    effectiveTo: null,
                    isPrimary: true,
                  },
                  select: { id: true },
                },
              },
            },
            examinerAssignments: {
              where: {
                status: AssignmentStatus.ACCEPTED,
                endedAt: null,
              },
              select: {
                id: true,
                examinerUserId: true,
                thesisVersionId: true,
              },
            },
          },
        },
        submissions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            documents: {
              where: {
                isDeleted: false,
                verificationStatus: DocumentVerificationStatus.VERIFIED,
              },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!order) {
      throw new CorrectionWorkflowError("Correction order not found.", 404);
    }
    if (order.thesis.student.supervisorAssignments.length === 0) {
      throw new CorrectionWorkflowError(
        "You are not the active primary Supervisor for this Student.",
        403,
      );
    }
    if (order.status !== CorrectionOrderStatus.SUBMITTED) {
      throw new CorrectionWorkflowError(
        "This correction order is not awaiting Supervisor review.",
        409,
      );
    }

    const submission = order.submissions[0];
    if (
      !submission ||
      !submission.revisedThesisVersionId ||
      submission.documents.length === 0
    ) {
      throw new CorrectionWorkflowError(
        "Verified, version-bound correction evidence is required.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    const isReturn = input.decision === "RETURN";
    await tx.correctionReview.create({
      data: {
        correctionSubmissionId: submission.id,
        stage: CorrectionReviewStage.SUPERVISOR,
        decision: isReturn
          ? CorrectionReviewDecision.RETURNED
          : CorrectionReviewDecision.CERTIFIED,
        reviewerUserId: auth.userId,
        notes,
      },
    });
    if (isReturn) {
      await tx.correctionSubmission.update({
        where: { id: submission.id },
        data: {
          returnedAt: new Date(),
          returnReason: notes ?? "Returned by the primary Supervisor.",
        },
      });
    }
    const nextStatus = isReturn
      ? CorrectionOrderStatus.RETURNED
      : CorrectionOrderStatus.SUPERVISOR_CERTIFIED;
    const updated = await tx.correctionOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });

    const examiners = order.requiresExaminerReview
      ? order.thesis.examinerAssignments.filter(
          (assignment) =>
            assignment.thesisVersionId ===
            order.originatingThesisVersionId,
        )
      : [];
    const hodUsers =
      !isReturn && !order.requiresExaminerReview
        ? await listActiveRoleRecipients(tx, UserRole.HOD)
        : [];
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:supervisor:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.CORRECTIONS_SUPERVISOR_REVIEWED,
        aggregateType: "CorrectionOrder",
        aggregateId: order.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: order.status,
        newState: nextStatus,
        metadata: {
          decision: input.decision,
          submissionId: submission.id,
          versionNumber: submission.versionNumber,
        },
      },
      isReturn
        ? [
            {
              eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:supervisor-return:student`,
              recipientId: order.thesis.student.userId,
              studentId: order.thesis.studentId,
              notificationEvent: "CORRECTIONS_REQUIRED",
              title: "Corrections returned by Supervisor",
              message:
                notes ??
                "Your primary Supervisor returned the correction submission.",
              actionUrl: "/dashboard/student/theses/corrections",
            },
          ]
        : [
            ...examiners.map((assignment) => ({
              eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:examiner:${assignment.id}`,
              recipientId: assignment.examinerUserId,
              studentId: order.thesis.studentId,
              notificationEvent: "CORRECTIONS_REQUIRED" as const,
              title: "Corrections awaiting Examiner review",
              message:
                "The primary Supervisor certified a correction submission assigned to you.",
              actionUrl: "/dashboard/examiner/corrections",
            })),
            ...hodUsers.map((hod) => ({
              eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:hod`,
              recipientId: hod.id,
              studentId: order.thesis.studentId,
              notificationEvent: "CORRECTIONS_REQUIRED" as const,
              title: "Corrections awaiting HOD decision",
              message:
                "The primary Supervisor certified the correction submission.",
              actionUrl: "/dashboard/hod/completions",
            })),
          ],
    );

    return updated;
  });
}

export async function reviewCorrectionsByExaminer(
  correctionOrderId: string,
  input: { decision: "APPROVE" | "RETURN"; notes?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.EXAMINER) {
    throw new CorrectionWorkflowError(
      "Only an assigned Examiner can review major corrections.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const order = await tx.correctionOrder.findUnique({
      where: { id: correctionOrderId },
      include: {
        thesis: {
          select: {
            studentId: true,
            student: {
              select: {
                userId: true,
                supervisorAssignments: {
                  where: { effectiveTo: null, isPrimary: true },
                  select: { supervisorUserId: true },
                  take: 1,
                },
              },
            },
            examinerAssignments: {
              where: {
                status: AssignmentStatus.ACCEPTED,
                endedAt: null,
              },
              select: {
                id: true,
                examinerUserId: true,
                thesisVersionId: true,
              },
            },
          },
        },
        submissions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            reviews: {
              where: {
                stage: CorrectionReviewStage.EXAMINER,
                decision: CorrectionReviewDecision.APPROVED,
              },
              select: { thesisExaminerAssignmentId: true },
            },
          },
        },
      },
    });
    if (!order) {
      throw new CorrectionWorkflowError("Correction order not found.", 404);
    }
    if (!order.requiresExaminerReview) {
      throw new CorrectionWorkflowError(
        "This correction order does not require Examiner review.",
        409,
      );
    }
    if (order.status !== CorrectionOrderStatus.SUPERVISOR_CERTIFIED) {
      throw new CorrectionWorkflowError(
        "Supervisor certification is required before Examiner review.",
        409,
      );
    }

    const assignments = order.thesis.examinerAssignments.filter(
      (assignment) =>
        assignment.thesisVersionId === order.originatingThesisVersionId,
    );
    const assignment = assignments.find(
      (candidate) => candidate.examinerUserId === auth.userId,
    );
    if (!assignment) {
      throw new CorrectionWorkflowError(
        "You are not assigned to the originating thesis version.",
        403,
      );
    }
    const submission = order.submissions[0];
    if (!submission) {
      throw new CorrectionWorkflowError(
        "A correction submission is required.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    const isReturn = input.decision === "RETURN";
    await tx.correctionReview.create({
      data: {
        correctionSubmissionId: submission.id,
        stage: CorrectionReviewStage.EXAMINER,
        decision: isReturn
          ? CorrectionReviewDecision.RETURNED
          : CorrectionReviewDecision.APPROVED,
        reviewerUserId: auth.userId,
        thesisExaminerAssignmentId: assignment.id,
        notes,
      },
    });

    const approvedAssignmentIds = new Set(
      submission.reviews.flatMap((review) =>
        review.thesisExaminerAssignmentId
          ? [review.thesisExaminerAssignmentId]
          : [],
      ),
    );
    if (!isReturn) {
      approvedAssignmentIds.add(assignment.id);
    }
    const allApproved =
      !isReturn &&
      assignments.length > 0 &&
      assignments.every((candidate) =>
        approvedAssignmentIds.has(candidate.id),
      );
    const nextStatus = isReturn
      ? CorrectionOrderStatus.RETURNED
      : allApproved
        ? CorrectionOrderStatus.EXAMINER_APPROVED
        : CorrectionOrderStatus.SUPERVISOR_CERTIFIED;
    if (isReturn) {
      await tx.correctionSubmission.update({
        where: { id: submission.id },
        data: {
          returnedAt: new Date(),
          returnReason: notes ?? "Returned by an assigned Examiner.",
        },
      });
    }
    const updated = await tx.correctionOrder.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });

    const hodUsers = allApproved
      ? await listActiveRoleRecipients(tx, UserRole.HOD)
      : [];
    const primarySupervisorUserId =
      order.thesis.student.supervisorAssignments[0]?.supervisorUserId ?? null;
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:examiner:${assignment.id}:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.CORRECTIONS_EXAMINER_REVIEWED,
        aggregateType: "CorrectionOrder",
        aggregateId: order.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: order.status,
        newState: nextStatus,
        metadata: {
          decision: input.decision,
          assignmentId: assignment.id,
          allApproved,
        },
      },
      isReturn
        ? [
            {
              eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:examiner-return:student`,
              recipientId: order.thesis.student.userId,
              studentId: order.thesis.studentId,
              notificationEvent: "CORRECTIONS_REQUIRED",
              title: "Corrections returned by Examiner",
              message:
                notes ?? "An assigned Examiner returned your corrections.",
              actionUrl: "/dashboard/student/theses/corrections",
            },
            ...(primarySupervisorUserId
              ? [
                  {
                    eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:examiner-return:supervisor`,
                    recipientId: primarySupervisorUserId,
                    studentId: order.thesis.studentId,
                    notificationEvent: "CORRECTIONS_REQUIRED" as const,
                    title: "Corrections returned by Examiner",
                    message:
                      "An assigned Examiner returned the correction submission.",
                    actionUrl: "/dashboard/supervisor/corrections",
                  },
                ]
              : []),
          ]
        : hodUsers.map((hod) => ({
            eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:examiner-complete:hod:${hod.id}`,
            recipientId: hod.id,
            studentId: order.thesis.studentId,
            notificationEvent: "CORRECTIONS_REQUIRED" as const,
            title: "Corrections ready for HOD decision",
            message: "All required Examiner correction reviews are approved.",
            actionUrl: "/dashboard/hod/completions",
          })),
    );

    return updated;
  });
}

export async function decideCorrectionCompletion(
  correctionOrderId: string,
  input: { decision: "APPROVE" | "RETURN"; notes?: string },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new CorrectionWorkflowError(
      "Only the Head of Department can decide correction completion.",
      403,
    );
  }

  return withSerializableRetry(async (tx) => {
    const order = await tx.correctionOrder.findUnique({
      where: { id: correctionOrderId },
      include: {
        thesis: {
          select: {
            id: true,
            studentId: true,
            student: {
              select: {
                userId: true,
                supervisorAssignments: {
                  where: { effectiveTo: null, isPrimary: true },
                  select: { supervisorUserId: true },
                  take: 1,
                },
              },
            },
            examinerAssignments: {
              where: {
                status: AssignmentStatus.ACCEPTED,
                endedAt: null,
              },
              select: { id: true, thesisVersionId: true },
            },
          },
        },
        submissions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            documents: {
              where: {
                isDeleted: false,
                verificationStatus: DocumentVerificationStatus.VERIFIED,
              },
              select: { id: true },
            },
            reviews: {
              select: {
                stage: true,
                decision: true,
                thesisExaminerAssignmentId: true,
              },
            },
          },
        },
      },
    });
    if (!order) {
      throw new CorrectionWorkflowError("Correction order not found.", 404);
    }

    const submission = order.submissions[0];
    if (
      !submission ||
      !submission.revisedThesisVersionId ||
      submission.documents.length === 0
    ) {
      throw new CorrectionWorkflowError(
        "Verified, version-bound correction evidence is required.",
        409,
      );
    }
    const supervisorCertified = submission.reviews.some(
      (review) =>
        review.stage === CorrectionReviewStage.SUPERVISOR &&
        review.decision === CorrectionReviewDecision.CERTIFIED,
    );
    if (!supervisorCertified) {
      throw new CorrectionWorkflowError(
        "Primary Supervisor certification is required.",
        409,
      );
    }

    const requiredAssignments = order.thesis.examinerAssignments.filter(
      (assignment) =>
        assignment.thesisVersionId === order.originatingThesisVersionId,
    );
    const approvedAssignmentIds = new Set(
      submission.reviews.flatMap((review) =>
        review.stage === CorrectionReviewStage.EXAMINER &&
        review.decision === CorrectionReviewDecision.APPROVED &&
        review.thesisExaminerAssignmentId
          ? [review.thesisExaminerAssignmentId]
          : [],
      ),
    );
    if (
      order.requiresExaminerReview &&
      (requiredAssignments.length === 0 ||
        requiredAssignments.some(
          (assignment) => !approvedAssignmentIds.has(assignment.id),
        ))
    ) {
      throw new CorrectionWorkflowError(
        "All required Examiner correction reviews must be approved.",
        409,
      );
    }

    const expectedStatus = order.requiresExaminerReview
      ? CorrectionOrderStatus.EXAMINER_APPROVED
      : CorrectionOrderStatus.SUPERVISOR_CERTIFIED;
    if (order.status !== expectedStatus) {
      throw new CorrectionWorkflowError(
        "This correction order is not ready for an HOD decision.",
        409,
      );
    }

    const notes = cleanNotes(input.notes);
    const isReturn = input.decision === "RETURN";
    if (isReturn) {
      await tx.correctionSubmission.update({
        where: { id: submission.id },
        data: {
          returnedAt: new Date(),
          returnReason: notes ?? "Returned by the HOD.",
        },
      });
    }
    const nextStatus = isReturn
      ? CorrectionOrderStatus.RETURNED
      : CorrectionOrderStatus.COMPLETION_APPROVED;
    const updated = await tx.correctionOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        completionApprovedBy: isReturn ? null : auth.userId,
        completionApprovedAt: isReturn ? null : new Date(),
        completionNotes: notes,
      },
    });
    if (!isReturn) {
      await tx.thesis.update({
        where: { id: order.thesis.id },
        data: { status: ThesisStatus.CORRECTIONS_APPROVED },
      });
    }

    const administrators = !isReturn
      ? await listActiveRoleRecipients(tx, UserRole.ADMINISTRATOR)
      : [];
    const primarySupervisorUserId =
      order.thesis.student.supervisorAssignments[0]?.supervisorUserId ?? null;
    await appendLifecycleEventAndEnqueue(
      tx,
      {
        eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:hod:${input.decision.toLowerCase()}`,
        eventType: LIFECYCLE_EVENT.CORRECTIONS_HOD_DECIDED,
        aggregateType: "CorrectionOrder",
        aggregateId: order.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: order.status,
        newState: nextStatus,
        metadata: {
          decision: input.decision,
          submissionId: submission.id,
          revisedThesisVersionId: submission.revisedThesisVersionId,
        },
      },
      [
        {
          eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:hod:student`,
          recipientId: order.thesis.student.userId,
          studentId: order.thesis.studentId,
          notificationEvent: "CORRECTIONS_REQUIRED",
          title: isReturn
            ? "Corrections returned by HOD"
            : "Corrections approved by HOD",
          message:
            notes ??
            (isReturn
              ? "The HOD returned the correction submission."
              : "The HOD approved completion of the ordered corrections."),
          actionUrl: "/dashboard/student/theses/corrections",
        },
        ...(primarySupervisorUserId
          ? [
              {
                eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:hod:supervisor`,
                recipientId: primarySupervisorUserId,
                studentId: order.thesis.studentId,
                notificationEvent: "CORRECTIONS_REQUIRED" as const,
                title: "HOD correction decision recorded",
                message: `The HOD ${input.decision.toLowerCase()}d the correction submission.`,
                actionUrl: "/dashboard/supervisor/corrections",
              },
            ]
          : []),
        ...administrators.map((administrator) => ({
          eventKey: `correction-order:${order.id}:version:${submission.versionNumber}:hod:admin:${administrator.id}`,
          recipientId: administrator.id,
          studentId: order.thesis.studentId,
          notificationEvent: "CORRECTIONS_REQUIRED" as const,
          title: "Corrections approved by HOD",
          message:
            "The correction requirement is academically complete and ready for completion processing.",
          actionUrl: "/dashboard/admin",
        })),
      ],
    );

    return updated;
  });
}
