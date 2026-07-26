import {
  AcademicStatus,
  ArchiveStatus,
  CompletionStatus,
  CorrectionOrderStatus,
  DocumentVerificationStatus,
  ExaminerRecommendation,
  GraduationStatus,
  MilestoneStatus,
  NotificationEvent,
  type Prisma,
  RegistrationStatus,
  ThesisStatus,
  UserRole,
} from "@prisma/client";

import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { assertEthicsGateSatisfied } from "@/lib/ethics/department-record";
import { prisma } from "@/lib/prisma/client";
import { assertValidThesisStatusTransition } from "@/lib/prisma/thesis-status";
import { getProgrammeRule } from "@/lib/programmes/rules";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentCompletionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentCompletionError";
    this.status = status;
  }
}

type CompletionTransaction = Prisma.TransactionClient;

function requireRole(
  auth: AuthenticatedUserContext,
  role: "HOD" | "ADMINISTRATOR",
  message: string,
) {
  if (auth.role !== role) {
    throw new DepartmentCompletionError(message, 403);
  }
}

async function listActiveRoleRecipients(
  transaction: CompletionTransaction,
  role: "HOD" | "ADMINISTRATOR",
) {
  return transaction.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
}

async function loadCompletionEvidence(
  transaction: CompletionTransaction,
  studentId: string,
) {
  const student = await transaction.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, displayName: true } },
      milestones: {
        select: { id: true, sequenceNumber: true, status: true },
        orderBy: { sequenceNumber: "asc" },
      },
      registrations: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
      },
      programmeCompletion: true,
      theses: {
        where: { isArchived: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          versions: {
            where: { isCurrent: true },
            include: {
              documents: {
                where: { isDeleted: false },
                select: {
                  id: true,
                  checksumSha256: true,
                  verificationStatus: true,
                },
              },
            },
          },
          viva: {
            include: {
              correctionOrders: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
    },
  });

  if (!student || student.isArchived) {
    throw new DepartmentCompletionError("Active Student record not found.", 404);
  }

  const rule = getProgrammeRule(student.programType, student.studyMode);
  if (
    student.milestones.length !== rule.milestoneCount ||
    student.milestones.some(
      (milestone) => milestone.status !== MilestoneStatus.APPROVED,
    )
  ) {
    throw new DepartmentCompletionError(
      `All ${rule.milestoneCount} fixed milestones must be completed.`,
      409,
    );
  }

  await assertEthicsGateSatisfied(transaction, student.id);

  const thesis = student.theses[0];
  const thesisVersion = thesis?.versions[0];
  if (!thesis?.viva?.hodOutcome || !thesisVersion) {
    throw new DepartmentCompletionError(
      "A final current thesis version and recorded HOD viva outcome are required.",
      409,
    );
  }

  if (
    !thesisVersion.manifestHash ||
    thesisVersion.documents.length === 0 ||
    thesisVersion.documents.some(
      (document) =>
        document.verificationStatus !== DocumentVerificationStatus.VERIFIED ||
        !document.checksumSha256,
    )
  ) {
    throw new DepartmentCompletionError(
      "The exact final thesis version must contain verified evidence.",
      409,
    );
  }

  const directPass =
    thesis.viva.hodOutcome === ExaminerRecommendation.PASS;
  const correctionOutcome =
    thesis.viva.hodOutcome === ExaminerRecommendation.MINOR_CORRECTIONS ||
    thesis.viva.hodOutcome === ExaminerRecommendation.MAJOR_CORRECTIONS;
  const unresolvedCorrections = thesis.viva.correctionOrders.some(
    (order) => order.status !== CorrectionOrderStatus.COMPLETION_APPROVED,
  );

  if (thesis.viva.hodOutcome === ExaminerRecommendation.FAIL) {
    throw new DepartmentCompletionError(
      "A failed viva outcome cannot proceed to academic completion.",
      409,
    );
  }

  if (
    (!directPass && !correctionOutcome) ||
    unresolvedCorrections ||
    (correctionOutcome && thesis.viva.correctionOrders.length === 0)
  ) {
    throw new DepartmentCompletionError(
      "Every ordered correction requirement must have HOD-approved closure.",
      409,
    );
  }

  const expectedThesisStatus = directPass
    ? ThesisStatus.UNDER_EXAMINATION
    : ThesisStatus.CORRECTIONS_APPROVED;
  if (thesis.status !== expectedThesisStatus) {
    throw new DepartmentCompletionError(
      "The thesis is not in the academic state required for completion.",
      409,
    );
  }

  return { student, thesis, thesisVersion };
}

export async function approveProgrammeCompletion(
  studentId: string,
  comments: string,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.HOD,
    "Only the Head of Department can approve programme completion.",
  );

  const reason = comments.trim();
  if (reason.length < 10) {
    throw new DepartmentCompletionError(
      "A completion approval reason of at least 10 characters is required.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const { student, thesis, thesisVersion } = await loadCompletionEvidence(
      tx as never,
      studentId,
    );
    const existing = student.programmeCompletion;

    if (existing?.status === CompletionStatus.COMPLETED) {
      return existing;
    }
    if (
      existing?.status === CompletionStatus.HOD_APPROVED &&
      existing.thesisId === thesis.id &&
      existing.thesisVersionId === thesisVersion.id
    ) {
      return existing;
    }
    if (
      existing &&
      (existing.thesisId !== thesis.id ||
        existing.thesisVersionId !== thesisVersion.id)
    ) {
      throw new DepartmentCompletionError(
        "An existing completion decision is bound to a different thesis version.",
        409,
      );
    }

    const approvedAt = new Date();
    const completion = await tx.programmeCompletion.upsert({
      where: { studentId },
      create: {
        studentId,
        thesisId: thesis.id,
        thesisVersionId: thesisVersion.id,
        status: CompletionStatus.HOD_APPROVED,
        approvedByHodUserId: auth.userId,
        hodApprovedAt: approvedAt,
        hodComments: reason,
      },
      update: {
        thesisId: thesis.id,
        thesisVersionId: thesisVersion.id,
        status: CompletionStatus.HOD_APPROVED,
        approvedByHodUserId: auth.userId,
        hodApprovedAt: approvedAt,
        hodComments: reason,
      },
    });

    await tx.viva.update({
      where: { id: thesis.viva!.id },
      data: { programmeCompletionId: completion.id },
    });

    const administrators = await listActiveRoleRecipients(
      tx as never,
      UserRole.ADMINISTRATOR,
    );
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `student:${studentId}:programme-completion:hod-approved`,
        eventType: LIFECYCLE_EVENT.PROGRAMME_COMPLETION_APPROVED,
        aggregateType: "ProgrammeCompletion",
        aggregateId: completion.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: existing?.status ?? null,
        newState: CompletionStatus.HOD_APPROVED,
        metadata: {
          thesisId: thesis.id,
          thesisVersionId: thesisVersion.id,
          reason,
        },
      },
      [
        {
          eventKey: `programme-completion:${completion.id}:hod-approved:student`,
          recipientId: student.userId,
          studentId,
          notificationEvent:
            NotificationEvent.PROGRAMME_COMPLETION_STATUS_CHANGED,
          title: "Academic completion approved",
          message:
            "The HOD approved your academic completion. The PG Coordinator must now record completion.",
          actionUrl: "/dashboard/student/progress",
        },
        ...administrators.map((administrator) => ({
          eventKey: `programme-completion:${completion.id}:hod-approved:admin:${administrator.id}`,
          recipientId: administrator.id,
          studentId,
          notificationEvent:
            NotificationEvent.PROGRAMME_COMPLETION_STATUS_CHANGED,
          title: "Completion ready to record",
          message: `${student.user.displayName} has HOD approval for academic completion.`,
          actionUrl: "/dashboard/admin/completions",
        })),
      ],
    );

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
    const approvedCompletion = await tx.programmeCompletion.findUnique({
      where: { studentId },
    });
    if (!approvedCompletion) {
      throw new DepartmentCompletionError(
        "HOD completion approval is required.",
        409,
      );
    }
    if (approvedCompletion.status === CompletionStatus.COMPLETED) {
      return approvedCompletion;
    }
    if (approvedCompletion.status !== CompletionStatus.HOD_APPROVED) {
      throw new DepartmentCompletionError(
        "HOD completion approval is required.",
        409,
      );
    }

    const { student, thesis, thesisVersion } = await loadCompletionEvidence(
      tx as never,
      studentId,
    );
    const completion = student.programmeCompletion;

    if (!completion || completion.id !== approvedCompletion.id) {
      throw new DepartmentCompletionError(
        "The approved completion record could not be revalidated.",
        409,
      );
    }
    if (
      completion.thesisId !== thesis.id ||
      completion.thesisVersionId !== thesisVersion.id
    ) {
      throw new DepartmentCompletionError(
        "The HOD approval does not match the current verified thesis version.",
        409,
      );
    }
    if (
      !student.registrations.some(
        (registration) =>
          registration.status === RegistrationStatus.ACTIVE ||
          registration.status === RegistrationStatus.LAPSED ||
          registration.status === RegistrationStatus.COMPLETED,
      )
    ) {
      throw new DepartmentCompletionError(
        "An active or lapsed registration is required for completion.",
        409,
      );
    }

    assertValidThesisStatusTransition(thesis.status, ThesisStatus.COMPLETED);
    const completedAt = new Date();
    const updated = await tx.programmeCompletion.update({
      where: { id: completion.id },
      data: {
        status: CompletionStatus.COMPLETED,
        recordedByAdminUserId: auth.userId,
        adminRecordedAt: completedAt,
        completedAt,
      },
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        academicStatus: AcademicStatus.COMPLETED,
        updatedBy: auth.userId,
      },
    });
    await tx.registration.updateMany({
      where: {
        studentId,
        status: {
          in: [RegistrationStatus.ACTIVE, RegistrationStatus.LAPSED],
        },
      },
      data: {
        status: RegistrationStatus.COMPLETED,
        completedAt,
      },
    });
    await tx.thesis.update({
      where: { id: thesis.id },
      data: { status: ThesisStatus.COMPLETED },
    });

    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `student:${studentId}:programme-completion:completed`,
        eventType: LIFECYCLE_EVENT.PROGRAMME_COMPLETION_RECORDED,
        aggregateType: "ProgrammeCompletion",
        aggregateId: completion.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: CompletionStatus.HOD_APPROVED,
        newState: CompletionStatus.COMPLETED,
        metadata: {
          thesisId: thesis.id,
          thesisVersionId: thesisVersion.id,
          completedAt: completedAt.toISOString(),
        },
      },
      [
        {
          eventKey: `programme-completion:${completion.id}:completed:student`,
          recipientId: student.userId,
          studentId,
          notificationEvent:
            NotificationEvent.PROGRAMME_COMPLETION_STATUS_CHANGED,
          title: "Programme completion recorded",
          message:
            "The PG Coordinator recorded your programme completion. Graduation remains a separate confirmed step.",
          actionUrl: "/dashboard/student/progress",
        },
      ],
    );

    return updated;
  });
}

export type GraduationInput = {
  graduationDate: Date;
  confirmationReference: string;
  notes?: string;
};

export async function recordGraduation(
  studentId: string,
  input: GraduationInput,
  auth: AuthenticatedUserContext,
) {
  requireRole(
    auth,
    UserRole.ADMINISTRATOR,
    "Only the PG Coordinator can record graduation.",
  );

  const confirmationReference = input.confirmationReference.trim();
  if (confirmationReference.length < 5) {
    throw new DepartmentCompletionError(
      "An external graduation confirmation reference is required.",
    );
  }
  if (
    Number.isNaN(input.graduationDate.getTime()) ||
    input.graduationDate > new Date()
  ) {
    throw new DepartmentCompletionError(
      "Graduation date must be a valid confirmed date that is not in the future.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { id: true } },
        programmeCompletion: true,
        graduationRecord: true,
        archiveRecord: true,
      },
    });
    if (!student) {
      throw new DepartmentCompletionError("Student record not found.", 404);
    }
    if (student.archiveRecord || student.academicStatus === AcademicStatus.ARCHIVED) {
      throw new DepartmentCompletionError(
        "An archived Student record cannot be changed.",
        409,
      );
    }
    if (
      !student.programmeCompletion ||
      student.programmeCompletion.status !== CompletionStatus.COMPLETED ||
      student.academicStatus !== AcademicStatus.COMPLETED
    ) {
      throw new DepartmentCompletionError(
        "Recorded programme completion is required before graduation.",
        409,
      );
    }
    if (student.graduationRecord) {
      const sameRecord =
        student.graduationRecord.status === GraduationStatus.GRADUATED &&
        student.graduationRecord.graduationDate?.getTime() ===
          input.graduationDate.getTime() &&
        student.graduationRecord.confirmationReference ===
          confirmationReference;
      if (sameRecord) {
        return student.graduationRecord;
      }
      throw new DepartmentCompletionError(
        "Graduation has already been recorded for this Student.",
        409,
      );
    }

    const graduation = await tx.graduationRecord.create({
      data: {
        studentId,
        status: GraduationStatus.GRADUATED,
        graduationDate: input.graduationDate,
        confirmationReference,
        recordedByUserId: auth.userId,
        notes: input.notes?.trim() || null,
      },
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        academicStatus: AcademicStatus.GRADUATED,
        updatedBy: auth.userId,
      },
    });
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `student:${studentId}:graduated`,
        eventType: LIFECYCLE_EVENT.GRADUATION_RECORDED,
        aggregateType: "GraduationRecord",
        aggregateId: graduation.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: AcademicStatus.COMPLETED,
        newState: AcademicStatus.GRADUATED,
        metadata: {
          graduationDate: input.graduationDate.toISOString(),
          confirmationReference,
        },
      },
      [
        {
          eventKey: `graduation:${graduation.id}:student`,
          recipientId: student.userId,
          studentId,
          notificationEvent: NotificationEvent.GRADUATION_RECORDED,
          title: "Graduation recorded",
          message:
            "The PG Coordinator recorded the Department's confirmed graduation information.",
          actionUrl: "/dashboard/student/progress",
        },
      ],
    );

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

  const archiveReason = reason.trim();
  if (archiveReason.length < 10) {
    throw new DepartmentCompletionError(
      "An archive reason of at least 10 characters is required.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { id: true } },
        programmeCompletion: true,
        graduationRecord: true,
        archiveRecord: true,
      },
    });
    if (!student) {
      throw new DepartmentCompletionError("Student record not found.", 404);
    }
    if (student.archiveRecord?.status === ArchiveStatus.ARCHIVED) {
      return student.archiveRecord;
    }
    if (
      !student.programmeCompletion ||
      student.programmeCompletion.status !== CompletionStatus.COMPLETED ||
      !student.graduationRecord ||
      student.graduationRecord.status !== GraduationStatus.GRADUATED ||
      student.academicStatus !== AcademicStatus.GRADUATED
    ) {
      throw new DepartmentCompletionError(
        "Confirmed graduation must be recorded before archive.",
        409,
      );
    }

    const archivedAt = new Date();
    const archive = await tx.studentArchiveRecord.create({
      data: {
        studentId,
        status: ArchiveStatus.ARCHIVED,
        archivedAt,
        archivedByUserId: auth.userId,
        reason: archiveReason,
      },
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        academicStatus: AcademicStatus.ARCHIVED,
        isArchived: true,
        updatedBy: auth.userId,
      },
    });
    await tx.registration.updateMany({
      where: {
        studentId,
        status: { not: RegistrationStatus.ARCHIVED },
      },
      data: {
        status: RegistrationStatus.ARCHIVED,
        archivedAt,
      },
    });
    await tx.thesis.update({
      where: { id: student.programmeCompletion.thesisId },
      data: {
        status: ThesisStatus.FINAL_ARCHIVE,
        isArchived: true,
      },
    });
    await Promise.all([
      tx.application.updateMany({
        where: { studentId, isArchived: false },
        data: { isArchived: true },
      }),
      tx.progressReport.updateMany({
        where: { studentId, isArchived: false },
        data: { isArchived: true },
      }),
      tx.researchProposal.updateMany({
        where: { studentId, isArchived: false },
        data: { isArchived: true },
      }),
      tx.ethicsApproval.updateMany({
        where: { studentId, isArchived: false },
        data: { isArchived: true },
      }),
    ]);

    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `student:${studentId}:archived`,
        eventType: LIFECYCLE_EVENT.RECORD_ARCHIVED,
        aggregateType: "StudentArchiveRecord",
        aggregateId: archive.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        previousState: AcademicStatus.GRADUATED,
        newState: AcademicStatus.ARCHIVED,
        metadata: {
          reason: archiveReason,
          archivedAt: archivedAt.toISOString(),
          firebaseIdentityChanged: false,
        },
      },
      [
        {
          eventKey: `student-archive:${archive.id}:student`,
          recipientId: student.userId,
          studentId,
          notificationEvent: NotificationEvent.RECORD_ARCHIVED,
          title: "Student lifecycle record archived",
          message:
            "The PG Coordinator archived the completed lifecycle record. Documents and audit history were retained.",
          actionUrl: "/dashboard/student/progress",
        },
      ],
    );

    return archive;
  });
}
