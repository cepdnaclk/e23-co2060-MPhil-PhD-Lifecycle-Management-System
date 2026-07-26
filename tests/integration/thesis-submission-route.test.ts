import {
  AcademicStatus,
  ProgramType,
  ProposalStatus,
  ReadinessDecision,
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
  notifyProgressReportSubmitted: vi.fn().mockResolvedValue({ success: true }),
  notifyThesisSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/uploads/sessions", () => ({
  createStagedUploadSession: vi.fn(),
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    thesis: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/theses/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";
import { verifyUploadSessionForFinalize } from "@/lib/uploads/sessions";

const uploadSessionId = "17c13d87-6e94-4685-a65b-49ba9aa1bdc4";

function request() {
  return new Request("http://localhost/api/theses", {
    method: "POST",
    headers: {
      authorization: "Bearer student-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Adaptive Systems Thesis",
      abstract: "A thesis about adaptive systems.",
      uploadSessionId,
    }),
  });
}

function eligibleStudent(registrations = [{ id: "registration-1" }]) {
  return {
    id: "student-1",
    programType: ProgramType.PHD,
    academicStatus: AcademicStatus.ACTIVE,
    user: {
      id: "user-student-1",
      displayName: "Student One",
      email: "student1@example.com",
    },
    registrations,
    ethicsApprovals: [{ id: "ethics-1" }],
    readinessCertifications: [
      { decision: ReadinessDecision.HOD_APPROVED },
    ],
    researchProposals: [{ id: "proposal-1", status: ProposalStatus.APPROVED }],
    theses: [],
    supervisorAssignments: [],
  };
}

describe("thesis staged submission route", () => {
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

  it("creates the domain record only after verified staged bytes", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      eligibleStudent() as never,
    );
    vi.mocked(verifyUploadSessionForFinalize).mockResolvedValue({
      state: "VERIFIED",
      session: {
        id: uploadSessionId,
        manifestHash: "manifest",
        files: [
          {
            id: "staged-1",
            ordinal: 0,
            fileName: "thesis.pdf",
            storagePath: "theses/student-1/staged/session/file/thesis.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            checksumSha256: "a".repeat(64),
          },
        ],
      },
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        thesis: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "thesis-1",
            status: ThesisStatus.SUBMITTED,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        thesisVersion: {
          aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: null } }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({}),
        },
        thesisReadinessCertification: {
          update: vi.fn().mockResolvedValue({}),
        },
        document: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx as never);
    });
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      title: "Adaptive Systems Thesis",
      abstract: "A thesis about adaptive systems.",
      status: ThesisStatus.SUBMITTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      documents: [
        {
          id: "doc-1",
          fileName: "thesis.pdf",
          storagePath: "theses/student-1/staged/session/file/thesis.pdf",
          mimeType: "application/pdf",
          version: 1,
          isCurrentVersion: true,
          createdAt: new Date(),
        },
      ],
    } as never);

    const response = await POST(request() as never, {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      thesis: {
        id: "thesis-1",
        documents: [
          expect.objectContaining({
            storagePath: "theses/student-1/staged/session/file/thesis.pdf",
          }),
        ],
      },
    });
  });

  it("rejects a lapsed student before touching the upload session", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(
      eligibleStudent([]) as never,
    );

    const response = await POST(request() as never, {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(403);
    expect(verifyUploadSessionForFinalize).not.toHaveBeenCalled();
  });
});
