import {
  RegistrationStatus,
  UserRole,
  type User,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class RegistrationError extends Error {
  status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "RegistrationError";
    this.status = status;
  }
}

export async function assertStudentHasActiveRegistration(
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== "STUDENT") {
    throw new RegistrationError(
      "Only students can access this progress report route.",
      403,
    );
  }

  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      registrations: {
        where: { status: RegistrationStatus.ACTIVE },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!student?.registrations.length) {
    throw new RegistrationError(
      "Your registration is not active. Contact the PG Coordinator before submitting progress.",
      403,
    );
  }

  return student;
}

export function isAdministratorUser(user: Pick<User, "role">) {
  return user.role === UserRole.ADMINISTRATOR;
}
