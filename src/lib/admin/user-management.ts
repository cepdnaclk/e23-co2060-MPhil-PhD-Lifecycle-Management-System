import { UserRole, ProgramType, type User } from "@prisma/client";

import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  setCustomClaimsForUser,
  updateFirebaseAuthUser,
} from "@/lib/firebase/admin";
import { notifyWelcomeAccountCreated } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import { isAppUserRole } from "@/types/auth";

const ADMIN_MANAGED_ROLES = [
  UserRole.STUDENT,
  UserRole.SUPERVISOR,
  UserRole.EXAMINER,
  UserRole.ADMINISTRATOR,
] as const;

export type AdminManagedRole = (typeof ADMIN_MANAGED_ROLES)[number];

export type CreateAdminUserInput = {
  email: string;
  displayName: string;
  role: AdminManagedRole;
  department?: string | null;
  specialization?: string | null;
  programType?: string | null;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string;
  role: AdminManagedRole;
  isActive: boolean;
  firebaseUid: string | null;
  createdAt: Date;
  department: string | null;
  specialization: string | null;
  programType?: string | null;
  studentId?: string | null;
  supervisorId?: string | null;
  examinerId?: string | null;
};

export class AdminUserManagementError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminUserManagementError";
    this.status = status;
  }
}

function assertAdminManagedRole(role: string): asserts role is AdminManagedRole {
  if (!ADMIN_MANAGED_ROLES.includes(role as AdminManagedRole)) {
    throw new AdminUserManagementError(
      "Only STUDENT, SUPERVISOR, EXAMINER, and ADMINISTRATOR accounts can be created here.",
      400,
    );
  }
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function generateTemporaryPassword(length = 18): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return password;
}

function buildLoginUrl() {
  return process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/login`
    : "http://localhost:3000/login";
}

async function createRoleProfile(
  tx: Pick<typeof prisma, "student" | "supervisor" | "examiner" | "administrator">,
  userId: string,
  role: AdminManagedRole,
  department: string | null,
  specialization: string | null,
  programType: string | null,
) {
  if (role === UserRole.STUDENT) {
    if (!programType) {
      throw new AdminUserManagementError("Program type is required for student accounts.", 400);
    }
    await tx.student.create({
      data: {
        userId,
        programType: programType as ProgramType,
        enrollmentDate: new Date(),
        academicStatus: "ACTIVE",
      },
    });
    return;
  }
  if (role === UserRole.SUPERVISOR) {
    await tx.supervisor.create({
      data: {
        userId,
        department,
        specialization,
      },
    });
    return;
  }

  if (role === UserRole.EXAMINER) {
    await tx.examiner.create({
      data: {
        userId,
        department,
        specialization,
      },
    });
    return;
  }

  await tx.administrator.create({
    data: {
      userId,
      department,
    },
  });
}

export async function listAdminManagedUsers(role?: string): Promise<AdminUserListItem[]> {
  if (role) {
    assertAdminManagedRole(role);
  }

  const users = await prisma.user.findMany({
    where: {
      role: role ? (role as AdminManagedRole) : { in: [...ADMIN_MANAGED_ROLES] },
    },
    include: {
      supervisor: {
        select: {
          id: true,
          department: true,
          specialization: true,
        },
      },
      examiner: {
        select: {
          id: true,
          department: true,
          specialization: true,
        },
      },
      administrator: {
        select: {
          id: true,
          department: true,
        },
      },
      student: {
        select: {
          id: true,
          programType: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as AdminManagedRole,
    isActive: user.isActive,
    firebaseUid: user.firebaseUid,
    createdAt: user.createdAt,
    department:
      user.supervisor?.department ??
      user.examiner?.department ??
      user.administrator?.department ??
      null,
    specialization:
      user.supervisor?.specialization ?? user.examiner?.specialization ?? null,
    programType: user.student?.programType ?? null,
    studentId: user.student?.id ?? null,
    supervisorId: user.supervisor?.id ?? null,
    examinerId: user.examiner?.id ?? null,
  }));
}

export async function createAdminManagedUser(input: CreateAdminUserInput) {
  const role = input.role;
  assertAdminManagedRole(role);

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const department = normalizeOptionalText(input.department);
  const specialization = normalizeOptionalText(input.specialization);
  const programType = normalizeOptionalText(input.programType);

  if (!email || !displayName) {
    throw new AdminUserManagementError("Email and display name are required.", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AdminUserManagementError(
      "A user with this email address already exists.",
      409,
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const firebaseUser = await createFirebaseAuthUser({
    email,
    password: temporaryPassword,
    displayName,
    disabled: false,
  });
  let createdUser:
    | {
        id: string;
        email: string;
        displayName: string;
        role: AdminManagedRole;
        isActive: boolean;
        firebaseUid: string | null;
      }
    | undefined;

  try {
    createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName,
          role,
          firebaseUid: firebaseUser.uid,
          isActive: true,
        },
      });

      await createRoleProfile(tx, user.id, role, department, specialization, programType);

      return user;
    });

    const claimRole = isAppUserRole(role) ? role : undefined;

    if (!claimRole || !isAppUserRole(claimRole)) {
      throw new AdminUserManagementError("Unsupported role claim.", 400);
    }

    await setCustomClaimsForUser(firebaseUser.uid, claimRole);

    if (!createdUser) {
      throw new AdminUserManagementError("User creation did not complete.", 500);
    }

    void notifyWelcomeAccountCreated({
      recipientUserId: createdUser.id,
      to: createdUser.email,
      recipientName: createdUser.displayName,
      roleLabel: createdUser.role,
      temporaryPassword,
      loginUrl: buildLoginUrl(),
    });

    return {
      user: createdUser,
      temporaryPassword,
    };
  } catch (error) {
    try {
      await deleteFirebaseAuthUser(firebaseUser.uid);
    } catch (cleanupError) {
      console.error("Failed to roll back Firebase user creation.", cleanupError);
    }

    if (createdUser) {
      try {
        await prisma.user.delete({
          where: {
            id: createdUser.id,
          },
        });
      } catch (cleanupError) {
        console.error("Failed to roll back database user creation.", cleanupError);
      }
    }

    throw error;
  }
}

export async function deactivateAdminManagedUser(userId: string): Promise<User> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firebaseUid: true,
      role: true,
      isActive: true,
    },
  });

  if (!existingUser) {
    throw new AdminUserManagementError("User not found.", 404);
  }

  if (
    existingUser.role !== UserRole.STUDENT &&
    existingUser.role !== UserRole.SUPERVISOR &&
    existingUser.role !== UserRole.EXAMINER &&
    existingUser.role !== UserRole.ADMINISTRATOR
  ) {
    throw new AdminUserManagementError(
      "Only administrator-managed users can be deactivated here.",
      400,
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
    },
  });

  if (existingUser.firebaseUid) {
    await updateFirebaseAuthUser(existingUser.firebaseUid, {
      disabled: true,
    });
  }

  return updatedUser;
}
