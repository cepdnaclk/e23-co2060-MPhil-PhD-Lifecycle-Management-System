import {
  AcademicStatus,
  ProgramType,
  ProposalStatus,
  ThesisStatus,
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
  notifyThesisSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");

  return {
    ...actual,
    generateUploadSignedUrl: vi.fn().mockResolvedValue(
      "https://storage.example.test/write?path=theses%2Fstudent-1%2F1%2Fthesis.pdf",
    ),
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    thesis: {
      create: vi.fn(),
      update: vi.fn(),
    },
    document: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/theses/route";
import { notifyThesisSubmittedToAdministrator } from "@/lib/email";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";

describe("thesis submission route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-1",
      userId: "user-student-1",
      firebaseUid: "firebase-student-1",
      role: "STUDENT",
      email: "student1@example.com",
    } as never);
  });

  it("creates the thesis record and links it to the stored firebase path", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      programType: ProgramType.PHD,
      academicStatus: AcademicStatus.ACTIVE,
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      registrations: [{ id: "registration-1" }],
      researchProposals: [
        {
          id: "proposal-1",
          status: ProposalStatus.APPROVED,
        },
      ],
      theses: [],
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "admin-1",
        displayName: "Admin One",
        email: "admin@example.com",
      },
    ] as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        thesis: {
          create: vi.fn().mockResolvedValue({
            id: "thesis-1",
            title: "Adaptive Systems Thesis",
            abstract: "A thesis about adaptive systems.",
            status: ThesisStatus.SUBMITTED,
            createdAt: new Date("2026-05-01T12:00:00.000Z"),
            updatedAt: new Date("2026-05-01T12:00:00.000Z"),
            documents: [
              {
                id: "doc-1",
                fileName: "thesis.pdf",
                storagePath: "theses/student-1/1/thesis.pdf",
                mimeType: "application/pdf",
                version: 1,
                isCurrentVersion: true,
                createdAt: new Date("2026-05-01T12:00:00.000Z"),
              },
            ],
          }),
        },
      };

      return callback(tx as never);
    });

    const response = await POST(
      new Request("http://localhost/api/theses", {
        method: "POST",
        headers: {
          authorization: "Bearer student-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Adaptive Systems Thesis",
          abstract: "A thesis about adaptive systems.",
          document: {
            fileName: "thesis.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024 * 1024,
          },
        }),
      }) as never,
      {},
    );

    expect(response.status).toBe(201);
    expect(notifyThesisSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "admin-1",
        studentName: "Student One",
        thesisTitle: "Adaptive Systems Thesis",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      thesis: expect.objectContaining({
        id: "thesis-1",
        status: ThesisStatus.SUBMITTED,
        documents: [
          expect.objectContaining({
            storagePath: "theses/student-1/1/thesis.pdf",
            isCurrentVersion: true,
          }),
        ],
      }),
      upload: expect.objectContaining({
        storagePath: "theses/student-1/1/thesis.pdf",
      }),
    });
  });

  it("bars a student with a lapsed registration from submitting a new thesis", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      programType: ProgramType.MPHIL,
      academicStatus: AcademicStatus.ACTIVE,
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      registrations: [],
      researchProposals: [
        {
          id: "proposal-1",
          status: ProposalStatus.APPROVED,
        },
      ],
      theses: [],
    } as never);

    const response = await POST(
      new Request("http://localhost/api/theses", {
        method: "POST",
        headers: {
          authorization: "Bearer student-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Adaptive Systems Thesis",
          abstract: "A thesis about adaptive systems.",
          document: {
            fileName: "thesis.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024 * 1024,
          },
        }),
      }) as never,
      {},
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Your registration is lapsed. Renew it before submitting a thesis.",
    });
  });
});
