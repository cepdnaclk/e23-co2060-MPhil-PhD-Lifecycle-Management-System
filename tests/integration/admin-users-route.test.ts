import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/auth", () => ({
  authenticateBearerRequest: vi.fn(),
  AuthError: class AuthError extends Error {
    status: 401 | 403;

    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/admin/user-management", () => ({
  AdminUserManagementError: class AdminUserManagementError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  createAdminManagedUser: vi.fn(),
  deactivateAdminManagedUser: vi.fn(),
  listAdminManagedUsers: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[id]/deactivate/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import {
  createAdminManagedUser,
  deactivateAdminManagedUser,
  listAdminManagedUsers,
} from "@/lib/admin/user-management";

describe("admin user routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      email: "admin@example.com",
      role: "ADMINISTRATOR",
    } as never);
  });

  it("lists administrator-managed users with role filtering", async () => {
    vi.mocked(listAdminManagedUsers).mockResolvedValue([
      {
        id: "user-supervisor-1",
        email: "sup1@example.com",
        displayName: "Dr. Supervisor",
        role: UserRole.SUPERVISOR,
        isActive: true,
        firebaseUid: "firebase-supervisor-1",
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
        department: "Computer Engineering",
        specialization: "AI",
      },
    ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/users?role=SUPERVISOR", {
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(listAdminManagedUsers).toHaveBeenCalledWith("SUPERVISOR");
    await expect(response.json()).resolves.toMatchObject({
      users: [
        expect.objectContaining({
          id: "user-supervisor-1",
          role: UserRole.SUPERVISOR,
        }),
      ],
    });
  });

  it("creates a new administrator-managed user", async () => {
    vi.mocked(createAdminManagedUser).mockResolvedValue({
      user: {
        id: "user-examiner-1",
        email: "examiner@example.com",
        displayName: "Dr. Examiner",
        role: UserRole.EXAMINER,
        isActive: true,
        firebaseUid: "firebase-examiner-1",
      },
      temporaryPassword: "TempPassword123!",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          email: "examiner@example.com",
          displayName: "Dr. Examiner",
          role: UserRole.EXAMINER,
          department: "Computer Engineering",
        }),
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(createAdminManagedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "examiner@example.com",
        role: UserRole.EXAMINER,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      user: expect.objectContaining({
        id: "user-examiner-1",
        role: UserRole.EXAMINER,
      }),
    });
  });

  it("deactivates a managed user by id", async () => {
    vi.mocked(deactivateAdminManagedUser).mockResolvedValue({
      id: "user-archive-1",
      role: UserRole.SUPERVISOR,
      isActive: false,
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/admin/users/user-archive-1/deactivate", {
        method: "PATCH",
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
      {
        params: {
          id: "user-archive-1",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(deactivateAdminManagedUser).toHaveBeenCalledWith("user-archive-1");
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-archive-1",
        role: UserRole.SUPERVISOR,
        isActive: false,
      },
    });
  });
});
