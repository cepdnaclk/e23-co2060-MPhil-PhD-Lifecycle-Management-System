import {
  ApplicationStatus,
  type AcademicStatus,
  type Prisma,
  type PrismaClient,
  type ProgramType,
} from "@prisma/client";

type CreateStudentWithUserInput = {
  user: {
    email: string;
    displayName: string;
    role: Prisma.UserCreateInput["role"];
    firebaseUid?: string;
  };
  student: {
    programType: ProgramType;
    academicStatus: AcademicStatus;
    enrollmentDate: Date;
    updatedBy?: string;
    applicationId?: string;
  };
};

export async function createStudentWithUser(
  db: PrismaClient,
  input: CreateStudentWithUserInput,
) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.user.email,
        displayName: input.user.displayName,
        role: input.user.role,
        firebaseUid: input.user.firebaseUid,
      },
    });

    const student = await tx.student.create({
      data: {
        userId: user.id,
        programType: input.student.programType,
        academicStatus: input.student.academicStatus,
        enrollmentDate: input.student.enrollmentDate,
        updatedBy: input.student.updatedBy,
      },
      include: {
        user: true,
      },
    });

    if (input.student.applicationId) {
      await tx.application.update({
        where: { id: input.student.applicationId },
        data: {
          studentId: student.id,
          status: ApplicationStatus.ADMITTED,
        },
      });
    }

    return student;
  });
}
