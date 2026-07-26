import {
  AcademicStatus,
  ArchiveStatus,
  CompletionStatus,
  CorrectionOrderStatus,
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
