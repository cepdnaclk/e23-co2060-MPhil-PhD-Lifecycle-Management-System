import { ProposalStatus, ThesisStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pglms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
  },
}));

import { getAuth } from "firebase-admin/auth";

import { GET } from "@/app/api/students/[id]/progress/route";
import { prisma } from "@/lib/prisma/client";

describe("student progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: {
      where: { firebaseUid?: string };
    }) => {
      const { where } = args;

      if (where.firebaseUid === "firebase-student-1") {
        return {
          id: "user-student-1",
          firebaseUid: "firebase-student-1",
          email: "student1@example.com",
          isActive: true,
        } as never;
      }

      if (where.firebaseUid === "firebase-student-2") {
        return {
          id: "user-student-2",
          firebaseUid: "firebase-student-2",
          email: "student2@example.com",
          isActive: true,
        } as never;
      }

      return null;
    }) as never);

    vi.mocked(getAuth).mockReturnValue({
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "STUDENT_ONE") {
          return {
            uid: "firebase-student-1",
            email: "student1@example.com",
            role: "STUDENT",
          };
        }

        if (token === "STUDENT_TWO") {
          return {
            uid: "firebase-student-2",
            email: "student2@example.com",
            role: "STUDENT",
          };
        }

        throw new Error("Invalid token");
      }),
    } as never);
  });

  it("allows a student to access their own progress dashboard", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: "MPHIL",
      enrollmentDate: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      researchProposals: [
        {
          id: "proposal-1",
          title: "Adaptive Systems",
          status: ProposalStatus.APPROVED,
          updatedAt: new Date("2026-05-02T04:00:00.000Z"),
        },
      ],
      theses: [
        {
          id: "thesis-1",
          title: "Adaptive Systems Thesis",
          status: ThesisStatus.SUBMITTED,
          updatedAt: new Date("2026-06-01T04:00:00.000Z"),
          corrections: [],
        },
      ],
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: "doc-1",
        documentType: "PROPOSAL",
        version: 1,
        isCurrentVersion: true,
        createdAt: new Date("2026-05-01T04:00:00.000Z"),
        updatedAt: new Date("2026-05-02T04:00:00.000Z"),
        researchProposal: {
          status: ProposalStatus.APPROVED,
        },
        progressReport: null,
        thesis: null,
        correctionDocument: null,
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/students/student-1/progress", {
        headers: {
          authorization: "Bearer STUDENT_ONE",
        },
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      progress: {
        student: {
          id: "student-1",
          displayName: "Student One",
        },
        currentMilestone: "proposal-approval",
      },
    });
  });

  it("returns 403 when a student tries to access another student's progress dashboard", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: "MPHIL",
      enrollmentDate: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      researchProposals: [],
      theses: [],
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue([] as never);

    const response = await GET(
      new Request("http://localhost/api/students/student-1/progress", {
        headers: {
          authorization: "Bearer STUDENT_TWO",
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

  it("responds within 500ms for a student with many document versions", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      userId: "user-student-1",
      programType: "PHD",
      enrollmentDate: new Date("2026-01-01T00:00:00.000Z"),
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      researchProposals: [
        {
          id: "proposal-1",
          title: "Adaptive Systems",
          status: ProposalStatus.UNDER_REVIEW,
          updatedAt: new Date("2026-05-02T04:00:00.000Z"),
        },
      ],
      theses: [],
    } as never);
    vi.mocked(prisma.document.findMany).mockResolvedValue(
      Array.from({ length: 24 }, (_, index) => ({
        id: `doc-${index + 1}`,
        documentType: index < 12 ? "PROPOSAL" : "PROGRESS_REPORT",
        version: index + 1,
        isCurrentVersion: index === 11 || index === 23,
        createdAt: new Date(`2026-05-${String((index % 9) + 1).padStart(2, "0")}T04:00:00.000Z`),
        updatedAt: new Date(`2026-05-${String((index % 9) + 1).padStart(2, "0")}T05:00:00.000Z`),
        researchProposal:
          index < 12
            ? {
                status: ProposalStatus.UNDER_REVIEW,
              }
            : null,
        progressReport:
          index >= 12
            ? {
                isSupervisorSignedOff: index % 2 === 0,
              }
            : null,
        thesis: null,
        correctionDocument: null,
      })) as never,
    );

    const startedAt = Date.now();
    const response = await GET(
      new Request("http://localhost/api/students/student-1/progress", {
        headers: {
          authorization: "Bearer STUDENT_ONE",
        },
      }) as never,
      {
        params: Promise.resolve({
          id: "student-1",
        }),
      },
    );
    const durationMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThan(500);
  });
});
