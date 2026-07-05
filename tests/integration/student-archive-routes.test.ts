import { AcademicStatus } from "@prisma/client";
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

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    administrator: {
      findUnique: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    application: {
      findMany: vi.fn(),
    },
    thesis: {
      findMany: vi.fn(),
    },
    progressReport: {
      findMany: vi.fn(),
    },
    researchProposal: {
      findMany: vi.fn(),
    },
    ethicsApproval: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { GET as getArchived } from "@/app/api/admin/archived/route";
import { PATCH as archiveStudent } from "@/app/api/students/[id]/archive/route";
import { authenticateBearerRequest, AuthError } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("student archive routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin archive attempts", async () => {
    vi.mocked(authenticateBearerRequest).mockRejectedValue(
      new AuthError("Forbidden.", 403),
    );

    const response = await archiveStudent(
      new Request("http://localhost/api/students/student-1/archive", {
        method: "PATCH",
        headers: {
          authorization: "Bearer student-token",
        },
      }) as never,
      { params: { id: "student-1" } } as never,
    );

    expect(response.status).toBe(403);
  });

  it("archives the student atomically and keeps the record available in the admin archive view", async () => {
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
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "student-1",
      academicStatus: AcademicStatus.ACTIVE,
      application: {
        id: "application-1",
        isArchived: false,
      },
      theses: [
        {
          id: "thesis-1",
          title: "Adaptive Systems",
          status: "UNDER_EXAMINATION",
        },
      ],
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        student: {
          update: vi.fn().mockResolvedValue({
            id: "student-1",
            academicStatus: AcademicStatus.ARCHIVED,
            isArchived: true,
          }),
        },
        application: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        progressReport: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        researchProposal: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        ethicsApproval: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      return callback(tx as never);
    });
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      {
        id: "student-1",
        academicStatus: AcademicStatus.ARCHIVED,
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        user: {
          displayName: "Student One",
          email: "student@example.com",
        },
      },
    ] as never);
    vi.mocked(prisma.application.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.thesis.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.progressReport.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.researchProposal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ethicsApproval.findMany).mockResolvedValue([] as never);

    const archiveResponse = await archiveStudent(
      new Request("http://localhost/api/students/student-1/archive", {
        method: "PATCH",
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
      { params: { id: "student-1" } } as never,
    );

    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      student: expect.objectContaining({
        id: "student-1",
        academicStatus: "ARCHIVED",
        isArchived: true,
      }),
      warnings: [
        expect.objectContaining({
          thesisId: "thesis-1",
        }),
      ],
    });

    const archivedResponse = await getArchived(
      new Request("http://localhost/api/admin/archived", {
        headers: {
          authorization: "Bearer admin-token",
        },
      }) as never,
    );

    expect(archivedResponse.status).toBe(200);
    await expect(archivedResponse.json()).resolves.toMatchObject({
      students: [
        expect.objectContaining({
          id: "student-1",
          academicStatus: "ARCHIVED",
        }),
      ],
    });
  });
});
