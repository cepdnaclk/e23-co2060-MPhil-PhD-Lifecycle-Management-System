import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  createFirebaseAuthUser: vi.fn(),
  deleteFirebaseAuthUser: vi.fn(),
  setCustomClaimsForUser: vi.fn(),
  updateFirebaseAuthUser: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  notifyWelcomeAccountCreated: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    supervisor: {
      create: vi.fn(),
    },
    examiner: {
      create: vi.fn(),
    },
    administrator: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  setCustomClaimsForUser,
  updateFirebaseAuthUser,
} from "@/lib/firebase/admin";
import { notifyWelcomeAccountCreated } from "@/lib/email";
import {
  AdminUserManagementError,
  createAdminManagedUser,
  deactivateAdminManagedUser,
} from "@/lib/admin/user-management";
import { prisma } from "@/lib/prisma/client";

describe("admin user management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the User and Supervisor records within a single transaction", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-supervisor-1",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "supervisor@example.com",
            displayName: "Dr. Supervisor",
            role: UserRole.SUPERVISOR,
            isActive: true,
            firebaseUid: "firebase-supervisor-1",
          }),
        },
        supervisor: {
          create: vi.fn().mockResolvedValue({
            id: "supervisor-1",
          }),
        },
        examiner: {
          create: vi.fn(),
        },
        administrator: {
          create: vi.fn(),
        },
      };

      const result = await callback(tx as never);

      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(tx.supervisor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            department: "Computer Engineering",
            specialization: "AI",
          }),
        }),
      );

      return result;
    });

    const result = await createAdminManagedUser({
      email: "supervisor@example.com",
      displayName: "Dr. Supervisor",
      role: UserRole.SUPERVISOR,
      department: "Computer Engineering",
      specialization: "AI",
    });

    expect(result.user.role).toBe(UserRole.SUPERVISOR);
    expect(setCustomClaimsForUser).toHaveBeenCalledWith(
      "firebase-supervisor-1",
      UserRole.SUPERVISOR,
    );
    expect(notifyWelcomeAccountCreated).toHaveBeenCalledTimes(1);
  });

  it("deletes the Firebase user if the database insert fails", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-examiner-1",
    } as never);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB insert failed"));

    await expect(
      createAdminManagedUser({
        email: "examiner@example.com",
        displayName: "Dr. Examiner",
        role: UserRole.EXAMINER,
      }),
    ).rejects.toThrow("DB insert failed");

    expect(deleteFirebaseAuthUser).toHaveBeenCalledWith("firebase-examiner-1");
  });

  it("removes the created database user if claim assignment fails", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-admin-claim-failure",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user-claim-failure",
            email: "admin@example.com",
            displayName: "Admin Person",
            role: UserRole.ADMINISTRATOR,
            isActive: true,
            firebaseUid: "firebase-admin-claim-failure",
          }),
        },
        supervisor: {
          create: vi.fn(),
        },
        examiner: {
          create: vi.fn(),
        },
        administrator: {
          create: vi.fn().mockResolvedValue({
            id: "administrator-claim-failure",
          }),
        },
      };

      return callback(tx as never);
    });
    vi.mocked(setCustomClaimsForUser).mockRejectedValue(
      new Error("Claim assignment failed"),
    );

    await expect(
      createAdminManagedUser({
        email: "admin@example.com",
        displayName: "Admin Person",
        role: UserRole.ADMINISTRATOR,
      }),
    ).rejects.toThrow("Claim assignment failed");

    expect(deleteFirebaseAuthUser).toHaveBeenCalledWith(
      "firebase-admin-claim-failure",
    );
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: {
        id: "user-claim-failure",
      },
    });
  });

  it("deactivation disables both database and Firebase login state", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-7",
      firebaseUid: "firebase-admin-7",
      role: UserRole.ADMINISTRATOR,
      isActive: true,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "user-7",
      email: "admin@example.com",
      displayName: "Admin User",
      role: UserRole.ADMINISTRATOR,
      isActive: false,
      firebaseUid: "firebase-admin-7",
    } as never);

    const result = await deactivateAdminManagedUser("user-7");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-7" },
        data: { isActive: false },
      }),
    );
    expect(updateFirebaseAuthUser).toHaveBeenCalledWith("firebase-admin-7", {
      disabled: true,
    });
    expect(result.isActive).toBe(false);
  });

  it("rejects attempts to create a student from the admin flow", async () => {
    await expect(
      createAdminManagedUser({
        email: "student@example.com",
        displayName: "Student User",
        role: UserRole.STUDENT as never,
      }),
    ).rejects.toBeInstanceOf(AdminUserManagementError);
  });
});
