import { z } from "zod";

import {
  appendLifecycleEvent,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { notifySupervisorAssigned } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export const supervisorAssignmentSchema = z.object({
  studentId: z.string().min(1, "Student id is required."),
  supervisorId: z.string().min(1, "Supervisor id is required."),
  isPrimary: z.boolean(),
});

export type SupervisorAssignmentInput = z.infer<typeof supervisorAssignmentSchema>;

export class SupervisorAssignmentError extends Error {
  status: 400 | 403 | 404 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
    this.name = "SupervisorAssignmentError";
    this.status = status;
  }
}

type AdministratorContext = {
  id: string;
  user: {
    displayName: string;
  };
};

type StudentAssignmentView = {
  id: string;
  user: {
    displayName: string;
  };
  supervisorAssignments: Array<{
    id: string;
    supervisorId: string;
    supervisorUserId: string;
    isPrimary: boolean;
    effectiveTo: Date | null;
  }>;
  examinerAssignments: Array<{
    examinerUserId: string;
  }>;
};

type SupervisorContext = {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    isActive: boolean;
  };
};

async function requireAdministratorContext(
  auth: AuthenticatedUserContext,
): Promise<AdministratorContext> {
  const administrator = await prisma.administrator.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      user: {
        select: {
          displayName: true,
        },
      },
    },
  });

  if (!administrator) {
    throw new SupervisorAssignmentError("Administrator profile not found.", 404);
  }

  return administrator;
}

async function requireStudent(studentId: string): Promise<StudentAssignmentView> {
  const student = await prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      user: {
        select: {
          displayName: true,
        },
      },
      supervisorAssignments: {
        where: {
          effectiveTo: null,
        },
        select: {
          id: true,
          supervisorId: true,
          supervisorUserId: true,
          isPrimary: true,
          effectiveTo: true,
        },
      },
      examinerAssignments: {
        select: {
          examinerUserId: true,
        },
      },
    },
  });

  if (!student) {
    throw new SupervisorAssignmentError("Student not found.", 404);
  }

  return student;
}

async function requireSupervisor(supervisorId: string): Promise<SupervisorContext> {
  const supervisor = await prisma.supervisor.findUnique({
    where: {
      id: supervisorId,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          isActive: true,
        },
      },
    },
  });

  if (!supervisor) {
    throw new SupervisorAssignmentError("Supervisor not found.", 404);
  }

  if (!supervisor.user.isActive) {
    throw new SupervisorAssignmentError("Supervisor account is inactive.", 409);
  }

  return supervisor;
}

function findExistingSupervisorAssignment(
  student: StudentAssignmentView,
  supervisor: SupervisorContext,
) {
  return student.supervisorAssignments.find(
    (assignment) =>
      assignment.supervisorId === supervisor.id ||
      assignment.supervisorUserId === supervisor.userId,
  );
}

function assertSupervisorNotAssignedAsExaminer(
  student: StudentAssignmentView,
  supervisor: SupervisorContext,
) {
  const hasExaminerConflict = student.examinerAssignments.some(
    (assignment) => assignment.examinerUserId === supervisor.userId,
  );

  if (hasExaminerConflict) {
    throw new SupervisorAssignmentError(
      "A supervisor cannot be assigned when the same user is already an examiner for this student.",
      400,
    );
  }
}

function assertAssignmentLimits(
  student: StudentAssignmentView,
  input: SupervisorAssignmentInput,
) {
  const totalAssignments = student.supervisorAssignments.length;
  const primaryAssignments = student.supervisorAssignments.filter(
    (assignment) => assignment.isPrimary,
  ).length;
  const coSupervisorAssignments = totalAssignments - primaryAssignments;

  if (totalAssignments >= 3) {
    throw new SupervisorAssignmentError(
      "A student can have at most 3 supervisors in total.",
      400,
    );
  }

  if (input.isPrimary || totalAssignments === 0) {
    return;
  }

  if (primaryAssignments === 0) {
    throw new SupervisorAssignmentError(
      "Assign a primary supervisor before adding co-supervisors.",
      400,
    );
  }

  if (coSupervisorAssignments >= 2) {
    throw new SupervisorAssignmentError(
      "A student can have at most 2 co-supervisors.",
      400,
    );
  }
}

function buildAssignmentRoleLabel(isPrimary: boolean) {
  return isPrimary ? "Primary Supervisor" : "Co-supervisor";
}

async function promoteAssignmentToPrimary(studentId: string, assignmentId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.supervisorAssignment.updateMany({
      where: {
        studentId,
        isPrimary: true,
        effectiveTo: null,
      },
      data: {
        isPrimary: false,
      },
    });

    return tx.supervisorAssignment.update({
      where: {
        id: assignmentId,
      },
      data: {
        isPrimary: true,
      },
      select: {
        id: true,
        studentId: true,
        supervisorId: true,
        supervisorUserId: true,
        isPrimary: true,
        assignedAt: true,
        assignedBy: true,
      },
    });
  });
}

export async function assignSupervisorToStudent(
  input: SupervisorAssignmentInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = supervisorAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new SupervisorAssignmentError(
      parsed.error.issues[0]?.message ?? "Invalid supervisor assignment payload.",
      400,
    );
  }

  const [administrator, student, supervisor] = await Promise.all([
    requireAdministratorContext(auth),
    requireStudent(parsed.data.studentId),
    requireSupervisor(parsed.data.supervisorId),
  ]);

  const existingAssignment = findExistingSupervisorAssignment(student, supervisor);

  if (existingAssignment) {
    if (parsed.data.isPrimary && !existingAssignment.isPrimary) {
      return promoteAssignmentToPrimary(student.id, existingAssignment.id);
    }

    throw new SupervisorAssignmentError(
      "This supervisor is already assigned to the selected student.",
      409,
    );
  }

  assertSupervisorNotAssignedAsExaminer(student, supervisor);
  assertAssignmentLimits(student, parsed.data);

  const shouldBePrimary =
    parsed.data.isPrimary || student.supervisorAssignments.length === 0;

  const assignment = await prisma.$transaction(async (tx) => {
    if (shouldBePrimary) {
      await tx.supervisorAssignment.updateMany({
        where: {
          studentId: student.id,
          isPrimary: true,
          effectiveTo: null,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const created = await tx.supervisorAssignment.create({
      data: {
        studentId: student.id,
        supervisorId: supervisor.id,
        supervisorUserId: supervisor.userId,
        isPrimary: shouldBePrimary,
        assignedAt: new Date(),
        effectiveFrom: new Date(),
        assignedBy: administrator.id,
      },
      select: {
        id: true,
        studentId: true,
        supervisorId: true,
        supervisorUserId: true,
        isPrimary: true,
        assignedAt: true,
        assignedBy: true,
      },
    });

    await appendLifecycleEvent(tx as never, {
      eventKey: `supervisor-assignment:${created.id}:assigned`,
      eventType: LIFECYCLE_EVENT.SUPERVISOR_ASSIGNED,
      aggregateType: "SupervisorAssignment",
      aggregateId: created.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: shouldBePrimary ? "PRIMARY_ACTIVE" : "CO_SUPERVISOR_ACTIVE",
      metadata: {
        studentId: student.id,
        supervisorId: supervisor.id,
      },
    });

    return created;
  });

  await notifySupervisorAssigned({
    recipientUserId: supervisor.user.id,
    to: supervisor.user.email,
    supervisorName: supervisor.user.displayName,
    studentName: student.user.displayName,
    assignmentRoleLabel: buildAssignmentRoleLabel(assignment.isPrimary),
    assignedByName: administrator.user.displayName,
  });

  return assignment;
}

export async function setPrimarySupervisorAssignment(
  assignmentId: string,
  auth: AuthenticatedUserContext,
) {
  await requireAdministratorContext(auth);

  const assignment = await prisma.supervisorAssignment.findUnique({
    where: {
      id: assignmentId,
    },
    select: {
      id: true,
      studentId: true,
      supervisorId: true,
      supervisorUserId: true,
      isPrimary: true,
      assignedAt: true,
      assignedBy: true,
      effectiveTo: true,
    },
  });

  if (!assignment) {
    throw new SupervisorAssignmentError("Assignment not found.", 404);
  }

  if (assignment.effectiveTo) {
    throw new SupervisorAssignmentError("Assignment has already ended.", 409);
  }

  if (assignment.isPrimary) {
    return assignment;
  }

  return promoteAssignmentToPrimary(assignment.studentId, assignment.id);
}

export async function removeSupervisorFromStudent(
  assignmentId: string,
  auth: AuthenticatedUserContext,
) {
  await requireAdministratorContext(auth);

  const assignment = await prisma.supervisorAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      student: {
        include: {
          user: true,
        },
      },
      supervisor: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new SupervisorAssignmentError("Assignment not found.", 404);
  }

  const replacement = assignment.isPrimary
    ? await prisma.supervisorAssignment.findFirst({
        where: {
          studentId: assignment.studentId,
          id: {
            not: assignment.id,
          },
          effectiveTo: null,
        },
        orderBy: {
          assignedAt: "asc",
        },
        select: {
          id: true,
        },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.supervisorAssignment.update({
      where: { id: assignmentId },
      data: {
        effectiveTo: new Date(),
        endReason: "Ended by PG Coordinator.",
        isPrimary: false,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `supervisor-assignment:${assignment.id}:ended`,
      eventType: LIFECYCLE_EVENT.SUPERVISOR_ASSIGNMENT_ENDED,
      aggregateType: "SupervisorAssignment",
      aggregateId: assignment.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: assignment.isPrimary ? "PRIMARY_ACTIVE" : "CO_SUPERVISOR_ACTIVE",
      newState: "ENDED",
      metadata: { studentId: assignment.studentId },
    });

    if (replacement) {
      await tx.supervisorAssignment.update({
        where: {
          id: replacement.id,
        },
        data: {
          isPrimary: true,
        },
      });
    }
  });

  return {
    success: true,
    removedSupervisorName: assignment.supervisor.user.displayName,
    studentName: assignment.student.user.displayName,
  };
}

export async function getAllStudentAssignments(auth: AuthenticatedUserContext) {
  await requireAdministratorContext(auth);

  const students = await prisma.student.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      programType: true,
      academicStatus: true,
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
      supervisorAssignments: {
        where: {
          effectiveTo: null,
        },
        select: {
          id: true,
          isPrimary: true,
          assignedAt: true,
          supervisor: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      user: {
        displayName: "asc",
      },
    },
  });

  return students;
}

