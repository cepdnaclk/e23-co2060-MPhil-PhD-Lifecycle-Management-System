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
    student: {
      findUnique: vi.fn(),
    },
    progressReport: {
      findMany: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/student/progress-reports/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("student progress report registration access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a lapsed student from progress report routes", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-lapsed",
      userId: "user-student-lapsed",
      firebaseUid: "firebase-student-lapsed",
      email: "lapsed@student.example",
      role: "STUDENT",
    } as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-lapsed",
      registrations: [],
    } as never);

    const response = await GET(
      new Request("http://localhost/api/student/progress-reports", {
        headers: {
          authorization: "Bearer lapsed-student-token",
        },
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Your registration is lapsed. Renew it before submitting progress reports.",
    });
  });

  it("allows an actively registered student to access progress report routes", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-active",
      userId: "user-student-active",
      firebaseUid: "firebase-student-active",
      email: "active@student.example",
      role: "STUDENT",
    } as never);
    vi.mocked(prisma.student.findUnique)
      .mockResolvedValueOnce({
        id: "student-active",
        registrations: [{ id: "registration-active-1" }],
      } as never)
      .mockResolvedValueOnce({
        id: "student-active",
      } as never);
    vi.mocked(prisma.progressReport.findMany).mockResolvedValue([
      {
        id: "report-1",
        studentId: "student-active",
        periodLabel: "2026 Q1",
        narrative: "Progress report narrative",
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/student/progress-reports", {
        headers: {
          authorization: "Bearer active-student-token",
        },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      reports: [
        {
          id: "report-1",
          periodLabel: "2026 Q1",
        },
      ],
    });
  });
});
