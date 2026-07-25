import {
  AcademicStatus,
  ProgramType,
  UserRole,
} from "@prisma/client";
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

vi.mock("@/lib/students/profile", () => ({
  StudentProfileError: class StudentProfileError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  getStudentProfileById: vi.fn(),
  parseRestrictedStudentProfileInput: vi.fn(),
  updateStudentProfileById: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/students/[id]/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import {
  getStudentProfileById,
  parseRestrictedStudentProfileInput,
  StudentProfileError,
  updateStudentProfileById,
} from "@/lib/students/profile";

describe("student profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks unauthorized student profile access", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-2",
      userId: "user-student-2",
      firebaseUid: "firebase-student-2",
      role: "STUDENT",
    } as never);
    vi.mocked(getStudentProfileById).mockRejectedValue(
      new StudentProfileError("Forbidden.", 403),
    );

    const response = await GET(
      new Request("http://localhost/api/students/student-1", {
        headers: {
          authorization: "Bearer student-token",
        },
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden.",
    });
  });

  it("returns the student profile for an assigned supervisor", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-supervisor-1",
      userId: "user-supervisor-1",
      firebaseUid: "firebase-supervisor-1",
      role: "SUPERVISOR",
    } as never);
    vi.mocked(getStudentProfileById).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: ProgramType.MPHIL,
      academicStatus: AcademicStatus.ACTIVE,
      enrollmentDate: new Date("2026-01-15T00:00:00.000Z"),
      updatedBy: null,
      updatedAt: new Date("2026-04-30T10:00:00.000Z"),
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
        role: UserRole.STUDENT,
        isActive: true,
      },
      supervisors: [
        {
          userId: "user-supervisor-1",
          displayName: "Dr. Supervisor",
          email: "sup@example.com",
        },
      ],
    } as never);

    const response = await GET(
      new Request("http://localhost/api/students/student-1", {
        headers: {
          authorization: "Bearer supervisor-token",
        },
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(getStudentProfileById).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({
        role: "SUPERVISOR",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      student: expect.objectContaining({
        id: "student-1",
        programType: ProgramType.MPHIL,
      }),
    });
  });

  it("returns 403 when a student attempts to patch restricted profile fields", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-1",
      userId: "user-student-1",
      firebaseUid: "firebase-student-1",
      role: "STUDENT",
    } as never);
    vi.mocked(parseRestrictedStudentProfileInput).mockReturnValue({
      programType: ProgramType.PHD,
    } as never);
    vi.mocked(updateStudentProfileById).mockRejectedValue(
      new StudentProfileError(
        "Only administrators can modify enrollment date, program type, or academic status.",
        403,
      ),
    );

    const response = await PATCH(
      new Request("http://localhost/api/students/student-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer student-token",
        },
        body: JSON.stringify({
          programType: ProgramType.PHD,
        }),
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Only administrators can modify enrollment date, program type, or academic status.",
    });
  });

  it("audits admin updates to restricted student fields", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      role: "ADMINISTRATOR",
    } as never);
    vi.mocked(parseRestrictedStudentProfileInput).mockReturnValue({
      programType: ProgramType.PHD,
      academicStatus: AcademicStatus.UNDER_REVIEW,
      enrollmentDate: new Date("2026-02-01T00:00:00.000Z"),
    } as never);
    vi.mocked(updateStudentProfileById).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: ProgramType.PHD,
      academicStatus: AcademicStatus.UNDER_REVIEW,
      enrollmentDate: new Date("2026-02-01T00:00:00.000Z"),
      updatedBy: "user-admin-1",
      updatedAt: new Date("2026-04-30T10:15:00.000Z"),
      user: {
        id: "user-student-1",
        email: "student@example.com",
        displayName: "Student One",
        role: UserRole.STUDENT,
        isActive: true,
      },
      supervisors: [],
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/students/student-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          programType: ProgramType.PHD,
          academicStatus: AcademicStatus.UNDER_REVIEW,
          enrollmentDate: "2026-02-01T00:00:00.000Z",
        }),
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateStudentProfileById).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({
        programType: ProgramType.PHD,
      }),
      expect.objectContaining({
        userId: "user-admin-1",
        role: "ADMINISTRATOR",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      student: expect.objectContaining({
        programType: ProgramType.PHD,
        updatedBy: "user-admin-1",
        updatedAt: "2026-04-30T10:15:00.000Z",
      }),
    });
  });
});
