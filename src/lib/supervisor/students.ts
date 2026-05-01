import { ProgramType, RegistrationStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export const supervisorStudentFilterSchema = z.object({
  programType: z.nativeEnum(ProgramType).optional(),
  registrationStatus: z.nativeEnum(RegistrationStatus).optional(),
});

export type SupervisorStudentFilters = z.infer<
  typeof supervisorStudentFilterSchema
>;

export class SupervisorStudentsError extends Error {
  status: 400 | 403 | 404 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 500 = 400) {
    super(message);
    this.name = "SupervisorStudentsError";
    this.status = status;
  }
}

export function parseSupervisorStudentFilters(input: unknown) {
  const parsed = supervisorStudentFilterSchema.safeParse(input);

  if (!parsed.success) {
    throw new SupervisorStudentsError(
      parsed.error.issues[0]?.message ?? "Invalid supervisor student filters.",
      400,
    );
  }

  return parsed.data;
}

type SupervisorStudentAssignmentRecord = {
  id: string;
  isPrimary: boolean;
  assignedAt: Date;
  student: {
    id: string;
    userId: string;
    programType: ProgramType;
    academicStatus: string;
    user: {
      displayName: string;
      email: string;
    };
    registrations: Array<{
      id: string;
      status: RegistrationStatus;
      startDate: Date;
      expirationDate: Date;
    }>;
    researchProposals: Array<{
      id: string;
      title: string;
      status: string;
      currentVersion: number;
      updatedAt: Date;
    }>;
  };
};

async function requireSupervisorRecord(auth: AuthenticatedUserContext) {
  const supervisor = await prisma.supervisor.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!supervisor) {
    throw new SupervisorStudentsError("Supervisor profile not found.", 404);
  }

  return supervisor;
}

function applyStudentFilters(
  records: SupervisorStudentAssignmentRecord[],
  filters: SupervisorStudentFilters,
) {
  return records.filter((record) => {
    const latestRegistration = record.student.registrations[0] ?? null;

    if (filters.programType && record.student.programType !== filters.programType) {
      return false;
    }

    if (
      filters.registrationStatus &&
      latestRegistration?.status !== filters.registrationStatus
    ) {
      return false;
    }

    return true;
  });
}

function mapSupervisorStudentRecord(record: SupervisorStudentAssignmentRecord) {
  const latestRegistration = record.student.registrations[0] ?? null;
  const latestProposal = record.student.researchProposals[0] ?? null;

  return {
    assignmentId: record.id,
    assignedAt: record.assignedAt,
    isPrimary: record.isPrimary,
    student: {
      id: record.student.id,
      userId: record.student.userId,
      displayName: record.student.user.displayName,
      email: record.student.user.email,
      programType: record.student.programType,
      academicStatus: record.student.academicStatus,
    },
    currentRegistration: latestRegistration
      ? {
          id: latestRegistration.id,
          status: latestRegistration.status,
          startDate: latestRegistration.startDate,
          expirationDate: latestRegistration.expirationDate,
        }
      : null,
    latestProposal: latestProposal
      ? {
          id: latestProposal.id,
          title: latestProposal.title,
          status: latestProposal.status,
          currentVersion: latestProposal.currentVersion,
          updatedAt: latestProposal.updatedAt,
        }
      : null,
  };
}

export async function getSupervisorAssignedStudents(
  auth: AuthenticatedUserContext,
  filters: SupervisorStudentFilters = {},
) {
  const supervisor = await requireSupervisorRecord(auth);

  const assignments = await prisma.supervisorAssignment.findMany({
    where: {
      supervisorId: supervisor.id,
    },
    orderBy: [
      {
        isPrimary: "desc",
      },
      {
        assignedAt: "asc",
      },
    ],
    select: {
      id: true,
      isPrimary: true,
      assignedAt: true,
      student: {
        select: {
          id: true,
          userId: true,
          programType: true,
          academicStatus: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
          registrations: {
            orderBy: {
              expirationDate: "desc",
            },
            take: 1,
            select: {
              id: true,
              status: true,
              startDate: true,
              expirationDate: true,
            },
          },
          researchProposals: {
            orderBy: {
              updatedAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              title: true,
              status: true,
              currentVersion: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  return applyStudentFilters(assignments, filters).map(mapSupervisorStudentRecord);
}
