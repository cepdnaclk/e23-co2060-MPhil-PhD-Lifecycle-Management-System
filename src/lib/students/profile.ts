import { AcademicStatus, ProgramType, UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";
import { type AuthenticatedUserContext } from "@/types/auth";

const restrictedStudentProfileSchema = z
  .object({
    enrollmentDate: z.coerce.date().optional(),
    programType: z.nativeEnum(ProgramType).optional(),
    academicStatus: z.nativeEnum(AcademicStatus).optional(),
  })
  .refine(
    (value) =>
      value.enrollmentDate !== undefined ||
      value.programType !== undefined ||
      value.academicStatus !== undefined,
    {
      message: "At least one student profile field must be provided.",
    },
  );

export type RestrictedStudentProfileInput = z.infer<
  typeof restrictedStudentProfileSchema
>;

export class StudentProfileError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StudentProfileError";
    this.status = status;
  }
}

export function parseRestrictedStudentProfileInput(input: unknown) {
  const parsed = restrictedStudentProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw new StudentProfileError(
      parsed.error.issues[0]?.message ?? "Invalid student profile payload.",
      400,
    );
  }

  return parsed.data;
}

type StudentProfileRecord = {
  id: string;
  userId: string;
  programType: ProgramType;
  academicStatus: AcademicStatus;
  isArchived: boolean;
  enrollmentDate: Date;
  updatedBy: string | null;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    isActive: boolean;
  };
  supervisorAssignments: Array<{
    supervisorUserId: string;
    supervisor: {
      user: {
        id: string;
        displayName: string;
        email: string;
      };
    };
  }>;
};

type StudentProfileAccessRecord = {
  userId: string;
  isArchived?: boolean;
  supervisorAssignments: Array<{
    supervisorUserId: string;
  }>;
};

async function findStudentProfileRecord(studentId: string) {
  return prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      userId: true,
      programType: true,
      academicStatus: true,
      isArchived: true,
      enrollmentDate: true,
      updatedBy: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
        },
      },
      supervisorAssignments: {
        select: {
          supervisorUserId: true,
          supervisor: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export function assertStudentProfileAccess(
  auth: AuthenticatedUserContext,
  student: StudentProfileAccessRecord,
) {
  if (auth.role === UserRole.ADMINISTRATOR) {
    return;
  }

  if (student.isArchived) {
    throw new StudentProfileError("Student profile not found.", 404);
  }

  if (auth.role === UserRole.STUDENT && student.userId === auth.userId) {
    return;
  }

  if (
    auth.role === UserRole.SUPERVISOR &&
    student.supervisorAssignments.some(
      (assignment) => assignment.supervisorUserId === auth.userId,
    )
  ) {
    return;
  }

  throw new StudentProfileError("Forbidden.", 403);
}

function toStudentProfileResponse(student: StudentProfileRecord) {
  return {
    id: student.id,
    userId: student.userId,
    programType: student.programType,
    academicStatus: student.academicStatus,
    isArchived: student.isArchived,
    isReadOnly:
      student.academicStatus === AcademicStatus.COMPLETED ||
      student.academicStatus === AcademicStatus.GRADUATED ||
      student.academicStatus === AcademicStatus.ARCHIVED,
    enrollmentDate: student.enrollmentDate,
    updatedBy: student.updatedBy,
    updatedAt: student.updatedAt,
    user: student.user,
    supervisors: student.supervisorAssignments.map((assignment) => ({
      userId: assignment.supervisor.user.id,
      displayName: assignment.supervisor.user.displayName,
      email: assignment.supervisor.user.email,
    })),
  };
}

export async function getStudentProfileById(
  studentId: string,
  auth: AuthenticatedUserContext,
) {
  const student = await findStudentProfileRecord(studentId);

  if (!student) {
    throw new StudentProfileError("Student profile not found.", 404);
  }

  assertStudentProfileAccess(auth, student);

  return toStudentProfileResponse(student);
}

export async function updateStudentProfileById(
  studentId: string,
  input: RestrictedStudentProfileInput,
  auth: AuthenticatedUserContext,
) {
  const student = await findStudentProfileRecord(studentId);

  if (!student) {
    throw new StudentProfileError("Student profile not found.", 404);
  }

  assertStudentProfileAccess(auth, student);

  if (
    student.academicStatus === AcademicStatus.COMPLETED ||
    student.academicStatus === AcademicStatus.GRADUATED ||
    student.academicStatus === AcademicStatus.ARCHIVED
  ) {
    throw new StudentProfileError(
      "Completed, graduated, and archived Student profiles are read-only.",
      409,
    );
  }

  if (student.isArchived) {
    throw new StudentProfileError("Archived student profiles are read-only.", 409);
  }

  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new StudentProfileError(
      "Only administrators can modify enrollment date, program type, or academic status.",
      403,
    );
  }

  const updatedStudent = await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      enrollmentDate: input.enrollmentDate,
      programType: input.programType,
      academicStatus: input.academicStatus,
      updatedBy: auth.userId,
    },
    select: {
      id: true,
      userId: true,
      programType: true,
      academicStatus: true,
      isArchived: true,
      enrollmentDate: true,
      updatedBy: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
        },
      },
      supervisorAssignments: {
        select: {
          supervisorUserId: true,
          supervisor: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return toStudentProfileResponse(updatedStudent);
}
