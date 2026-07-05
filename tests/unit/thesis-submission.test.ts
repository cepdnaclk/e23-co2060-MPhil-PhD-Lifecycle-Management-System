import {
  AcademicStatus,
  ProgramType,
  ProposalStatus,
  ThesisStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    $transaction: vi.fn(),
  },
}));

import { assertValidThesisStatusTransition } from "@/lib/prisma/thesis-status";
import { prisma } from "@/lib/prisma/client";
import { submitThesis, ThesisSubmissionError } from "@/lib/theses/submission";

describe("thesis submission rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks thesis submission when the student does not have an approved proposal", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      programType: ProgramType.MPHIL,
      academicStatus: AcademicStatus.ACTIVE,
      user: {
        id: "user-student-1",
        displayName: "Student One",
        email: "student1@example.com",
      },
      registrations: [{ id: "registration-1" }],
      researchProposals: [],
      theses: [],
    } as never);

    await expect(
      submitThesis(
        {
          title: "Adaptive Systems Thesis",
          abstract: "A thesis about adaptive systems.",
          document: {
            fileName: "thesis.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024 * 1024,
          },
        },
        {
          uid: "firebase-student-1",
          userId: "user-student-1",
          firebaseUid: "firebase-student-1",
          role: "STUDENT",
          email: "student1@example.com",
        },
      ),
    ).rejects.toMatchObject<ThesisSubmissionError>({
      status: 409,
      message: "An approved research proposal is required before thesis submission.",
    });
  });

  it("rejects an invalid thesis status transition", () => {
    expect(() =>
      assertValidThesisStatusTransition(
        ThesisStatus.SUBMITTED,
        ThesisStatus.FINAL_ARCHIVE,
      ),
    ).toThrow("Invalid thesis status transition: SUBMITTED -> FINAL_ARCHIVE");
  });
});
