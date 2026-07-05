import {
  AcademicStatus,
  CorrectionType,
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

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyCorrectionSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  notifyThesisArchived: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyInBackground: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    administrator: {
      findUnique: vi.fn(),
    },
    correctionDocument: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    thesis: {
      findUnique: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notif-1" }),
    },
    $transaction: vi.fn(),
  },
}));

import { PATCH as approveCorrection } from "@/app/api/theses/[id]/corrections/[cid]/approve/route";
import { PATCH as archiveThesis } from "@/app/api/theses/[id]/archive/route";
import { GET as getStudentProfile } from "@/app/api/students/[id]/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("thesis corrections and archive integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approving a correction document sets isApproved to true", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      role: "ADMINISTRATOR",
      email: "admin@example.com",
    } as never);
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
    } as never);
    vi.mocked(prisma.correctionDocument.findFirst).mockResolvedValue({
      id: "correction-1",
      thesisId: "thesis-1",
      isApproved: false,
      approvedAt: null,
      approvedById: null,
    } as never);
    vi.mocked(prisma.correctionDocument.update).mockResolvedValue({
      id: "correction-1",
      thesisId: "thesis-1",
      correctionType: CorrectionType.MINOR,
      description: "Updated chapter 4.",
      isApproved: true,
      approvedAt: new Date("2026-05-01T14:00:00.000Z"),
      approvedById: "admin-1",
    } as never);

    const response = await approveCorrection(
      new Request("http://localhost/api/theses/thesis-1/corrections/correction-1/approve", {
        method: "PATCH",
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
      {
        params: {
          id: "thesis-1",
          cid: "correction-1",
        },
      } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      correction: expect.objectContaining({
        id: "correction-1",
        isApproved: true,
        approvedById: "admin-1",
      }),
    });
  });

  it("applies the terminal graduated state and exposes the student profile as read-only", async () => {
    vi.mocked(authenticateBearerRequest).mockImplementation(async (request: never) => {
      const authHeader = (request as Request).headers.get("authorization");

      if (authHeader === "Bearer admin-token") {
        return {
          uid: "firebase-admin-1",
          userId: "user-admin-1",
          firebaseUid: "firebase-admin-1",
          role: "ADMINISTRATOR",
          email: "admin@example.com",
        } as never;
      }

      return {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student1@example.com",
      } as never;
    });
    vi.mocked(prisma.administrator.findUnique).mockResolvedValue({
      id: "admin-1",
    } as never);
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      status: "CORRECTIONS_REQUIRED",
      studentId: "student-1",
      student: {
        academicStatus: AcademicStatus.ACTIVE,
        user: {
          id: "user-student-1",
          email: "student1@example.com",
          displayName: "Student One",
        },
      },
      corrections: [
        {
          id: "correction-1",
        },
      ],
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        thesis: {
          update: vi.fn().mockResolvedValue({
            id: "thesis-1",
            status: "FINAL_ARCHIVE",
            title: "Adaptive Systems Thesis",
          }),
          findUniqueOrThrow: vi.fn(),
        },
        student: {
          update: vi.fn().mockResolvedValue({
            id: "student-1",
            academicStatus: AcademicStatus.GRADUATED,
          }),
          findUniqueOrThrow: vi.fn(),
        },
      };

      return callback(tx as never);
    });
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: ProgramType.PHD,
      academicStatus: AcademicStatus.GRADUATED,
      enrollmentDate: new Date("2024-01-15T00:00:00.000Z"),
      updatedBy: "user-admin-1",
      updatedAt: new Date("2026-05-01T15:00:00.000Z"),
      user: {
        id: "user-student-1",
        email: "student1@example.com",
        displayName: "Student One",
        role: UserRole.STUDENT,
        isActive: true,
      },
      supervisorAssignments: [],
    } as never);

    const archiveResponse = await archiveThesis(
      new Request("http://localhost/api/theses/thesis-1/archive", {
        method: "PATCH",
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
      {
        params: {
          id: "thesis-1",
        },
      } as never,
    );

    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      thesis: expect.objectContaining({
        id: "thesis-1",
        status: "FINAL_ARCHIVE",
      }),
      student: expect.objectContaining({
        id: "student-1",
        academicStatus: AcademicStatus.GRADUATED,
      }),
    });

    const profileResponse = await getStudentProfile(
      new Request("http://localhost/api/students/student-1", {
        headers: {
          authorization: "Bearer student-token",
        },
      }) as never,
      {
        params: {
          id: "student-1",
        },
      } as never,
    );

    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      student: expect.objectContaining({
        id: "student-1",
        academicStatus: AcademicStatus.GRADUATED,
        isReadOnly: true,
      }),
    });
  });
});
