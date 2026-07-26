import {
  AcademicStatus,
  ArchiveStatus,
  CompletionStatus,
  CorrectionOrderStatus,
  CorrectionType,
  ExaminerRecommendation,
  GraduationStatus,
  UserRole,
} from "@prisma/client";

import {
  appendLifecycleEvent,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentCompletionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentCompletionError";
    this.status = status;
  }
}

function requireRole(
  auth: AuthenticatedUserContext,
  role: "HOD" | "ADMINISTRATOR" | "STUDENT",
  message: string,
) {
  if (auth.role !== role) {
    throw new DepartmentCompletionError(message, 403);
  }
}

export async function orderVivaCorrections(
  vivaId: string,
  input: {
    requirementType: CorrectionType;
    requirements: string;
    dueDate?: Date;
  },
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.HOD,
    "Only the Head of Department can order corrections.",
  );

  return prisma.$transaction(async (tx) => {
    const viva = await tx.viva.findUnique({
      where: { id: vivaId },
      include: {
        correctionOrders: {
          where: {
            status: {
              in: [
                CorrectionOrderStatus.ORDERED,
                CorrectionOrderStatus.SUBMITTED,
                CorrectionOrderStatus.RETURNED,
              ],
            },
          },
          select: { id: true },
        },
      },
    });

    if (!viva) {
      throw new DepartmentCompletionError("Viva not found.", 404);
    }

    const expectedOutcome =
      input.requirementType === CorrectionType.MINOR
        ? ExaminerRecommendation.MINOR_CORRECTIONS
        : ExaminerRecommendation.MAJOR_CORRECTIONS;
    if (viva.hodOutcome !== expectedOutcome) {
      throw new DepartmentCompletionError(
        "The correction type must match the recorded HOD viva outcome.",
        409,
      );
    }

    if (viva.correctionOrders.length > 0) {
      throw new DepartmentCompletionError(
        "An active correction order already exists.",
        409,
      );
    }

    const order = await tx.correctionOrder.create({
      data: {
        vivaId: viva.id,
        thesisId: viva.thesisId,
        orderedByHodUserId: auth.userId,
        requirementType: input.requirementType,
        requirements: input.requirements,
        dueDate: input.dueDate,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `correction-order:${order.id}:ordered`,
      eventType: LIFECYCLE_EVENT.CORRECTIONS_ORDERED,
      aggregateType: "CorrectionOrder",
      aggregateId: order.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: CorrectionOrderStatus.ORDERED,
      metadata: { requirementType: input.requirementType },
    });

    return order;
  });
}

export async function submitOrderedCorrections(
  correctionOrderId: string,
  input: { responseSummary: string },
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.STUDENT,
    "Only the student can submit ordered corrections.",
  );

  return prisma.$transaction(async (tx) => {
    const order = await tx.correctionOrder.findUnique({
      where: { id: correctionOrderId },
      include: {
        thesis: {
          select: {
            student: { select: { userId: true } },
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
      throw new DepartmentCompletionError("Correction order not found.", 404);
    }

    if (order.thesis.student.userId !== auth.userId) {
      throw new DepartmentCompletionError(
        "This correction order belongs to another student.",
        403,
      );
    }

    if (
      order.status !== CorrectionOrderStatus.ORDERED &&
      order.status !== CorrectionOrderStatus.RETURNED
    ) {
      throw new DepartmentCompletionError(
        "This correction order is not open for submission.",
        409,
      );
    }

    const versionNumber = (order.submissions[0]?.versionNumber ?? 0) + 1;
    const submission = await tx.correctionSubmission.create({
      data: {
        correctionOrderId: order.id,
        versionNumber,
        responseSummary: input.responseSummary,
        submittedByUserId: auth.userId,
      },
    });
    await tx.correctionOrder.update({
      where: { id: order.id },
      data: { status: CorrectionOrderStatus.SUBMITTED },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `correction-order:${order.id}:version:${versionNumber}:submitted`,
      eventType: LIFECYCLE_EVENT.CORRECTIONS_SUBMITTED,
      aggregateType: "CorrectionOrder",
      aggregateId: order.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: order.status,
      newState: CorrectionOrderStatus.SUBMITTED,
      metadata: { versionNumber },
    });

    return submission;
  });
}

export async function approveCorrectionCompletion(
  correctionOrderId: string,
  notes: string | undefined,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.HOD,
    "Only the Head of Department can approve correction completion.",
  );

  return prisma.$transaction(async (tx) => {
    const order = await tx.correctionOrder.findUnique({
      where: { id: correctionOrderId },
    });

    if (!order) {
      throw new DepartmentCompletionError("Correction order not found.", 404);
    }

    if (order.status !== CorrectionOrderStatus.SUBMITTED) {
      throw new DepartmentCompletionError(
        "Submitted corrections are required before completion approval.",
        409,
      );
    }

    const updated = await tx.correctionOrder.update({
      where: { id: order.id },
      data: {
        status: CorrectionOrderStatus.COMPLETION_APPROVED,
        completionApprovedBy: auth.userId,
        completionApprovedAt: new Date(),
        completionNotes: notes,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `correction-order:${order.id}:completion-approved`,
      eventType: LIFECYCLE_EVENT.CORRECTIONS_COMPLETION_APPROVED,
      aggregateType: "CorrectionOrder",
      aggregateId: order.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: order.status,
      newState: CorrectionOrderStatus.COMPLETION_APPROVED,
    });

    return updated;
  });
}

export async function approveProgrammeCompletion(
  studentId: string,
  comments: string | undefined,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.HOD,
    "Only the Head of Department can approve programme completion.",
  );

  return prisma.$transaction(async (tx) => {
    const thesis = await tx.thesis.findFirst({
      where: { studentId, isArchived: false },
      orderBy: { createdAt: "desc" },
      include: {
        viva: {
          include: {
            correctionOrders: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!thesis?.viva?.hodOutcome) {
      throw new DepartmentCompletionError(
        "A recorded HOD viva outcome is required.",
        409,
      );
    }

    const directPass = thesis.viva.hodOutcome === ExaminerRecommendation.PASS;
    const correctionsComplete =
      thesis.viva.correctionOrders[0]?.status ===
      CorrectionOrderStatus.COMPLETION_APPROVED;
    if (!directPass && !correctionsComplete) {
      throw new DepartmentCompletionError(
        "Ordered corrections must be completed first.",
        409,
      );
    }

    const completion = await tx.programmeCompletion.upsert({
      where: { studentId },
      create: {
        studentId,
        thesisId: thesis.id,
        status: CompletionStatus.HOD_APPROVED,
        approvedByHodUserId: auth.userId,
        hodApprovedAt: new Date(),
        hodComments: comments,
      },
      update: {
        status: CompletionStatus.HOD_APPROVED,
        approvedByHodUserId: auth.userId,
        hodApprovedAt: new Date(),
        hodComments: comments,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `student:${studentId}:programme-completion:hod-approved`,
      eventType: LIFECYCLE_EVENT.PROGRAMME_COMPLETION_RECORDED,
      aggregateType: "Student",
      aggregateId: studentId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: CompletionStatus.HOD_APPROVED,
    });

    return completion;
  });
}

export async function recordProgrammeCompletion(
  studentId: string,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.ADMINISTRATOR,
    "Only the PG Coordinator can record programme completion.",
  );

  return prisma.$transaction(async (tx) => {
    const completion = await tx.programmeCompletion.findUnique({
      where: { studentId },
    });

    if (!completion || completion.status !== CompletionStatus.HOD_APPROVED) {
      throw new DepartmentCompletionError(
        "HOD completion approval is required.",
        409,
      );
    }

    const updated = await tx.programmeCompletion.update({
      where: { id: completion.id },
      data: {
        status: CompletionStatus.ADMIN_RECORDED,
        recordedByAdminUserId: auth.userId,
        adminRecordedAt: new Date(),
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `student:${studentId}:programme-completion:admin-recorded`,
      eventType: LIFECYCLE_EVENT.PROGRAMME_COMPLETION_RECORDED,
      aggregateType: "Student",
      aggregateId: studentId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: CompletionStatus.HOD_APPROVED,
      newState: CompletionStatus.ADMIN_RECORDED,
    });

    return updated;
  });
}

export async function recordGraduation(
  studentId: string,
  graduationDate: Date,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.ADMINISTRATOR,
    "Only the PG Coordinator can record graduation.",
  );

  return prisma.$transaction(async (tx) => {
    const completion = await tx.programmeCompletion.findUnique({
      where: { studentId },
    });
    if (!completion || completion.status !== CompletionStatus.ADMIN_RECORDED) {
      throw new DepartmentCompletionError(
        "Recorded programme completion is required before graduation.",
        409,
      );
    }

    const graduation = await tx.graduationRecord.upsert({
      where: { studentId },
      create: {
        studentId,
        status: GraduationStatus.GRADUATED,
        graduationDate,
        recordedByUserId: auth.userId,
      },
      update: {
        status: GraduationStatus.GRADUATED,
        graduationDate,
        recordedByUserId: auth.userId,
      },
    });
    await tx.student.update({
      where: { id: studentId },
      data: { academicStatus: AcademicStatus.GRADUATED },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `student:${studentId}:graduated`,
      eventType: LIFECYCLE_EVENT.GRADUATION_RECORDED,
      aggregateType: "Student",
      aggregateId: studentId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: GraduationStatus.GRADUATED,
    });

    return graduation;
  });
}

export async function archiveStudentRecord(
  studentId: string,
  reason: string,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.ADMINISTRATOR,
    "Only the PG Coordinator can archive a student record.",
  );

  return prisma.$transaction(async (tx) => {
    const graduation = await tx.graduationRecord.findUnique({
      where: { studentId },
    });
    if (!graduation || graduation.status !== GraduationStatus.GRADUATED) {
      throw new DepartmentCompletionError(
        "Graduation must be recorded before archive.",
        409,
      );
    }

    const archive = await tx.studentArchiveRecord.upsert({
      where: { studentId },
      create: {
        studentId,
        status: ArchiveStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedByUserId: auth.userId,
        reason,
      },
      update: {
        status: ArchiveStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedByUserId: auth.userId,
        reason,
      },
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        academicStatus: AcademicStatus.ARCHIVED,
        isArchived: true,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `student:${studentId}:archived`,
      eventType: LIFECYCLE_EVENT.RECORD_ARCHIVED,
      aggregateType: "Student",
      aggregateId: studentId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: ArchiveStatus.ARCHIVED,
      metadata: { reason },
    });

    return archive;
  });
}
