import {
  AcademicStatus,
  ProgramType,
  ThesisStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProgressReportSubmitted: vi.fn().mockResolvedValue({ success: true }),
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
import { submitThesis } from "@/lib/theses/submission";
import { thesisSubmissionSchema } from "@/lib/theses/schemas";

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
      ethicsApprovals: [{ id: "ethics-1" }],
      theses: [],
      supervisorAssignments: [],
    } as never);

    await expect(
      submitThesis(
        {
          title: "Adaptive Systems Thesis",
          abstract: "A thesis about adaptive systems.",
          documents: [
            {
              fileName: "thesis.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1024 * 1024,
            },
          ],
        },
        {
          uid: "firebase-student-1",
          userId: "user-student-1",
          firebaseUid: "firebase-student-1",
          role: "STUDENT",
          email: "student1@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "An approved research proposal is required before thesis submission.",
    });
  });

  it("temporarily rejects more than one thesis document before persistence", async () => {
    const documents = ["thesis.pdf", "appendix.zip"].map((fileName) => ({
      fileName,
      mimeType: fileName.endsWith(".pdf")
        ? ("application/pdf" as const)
        : ("application/zip" as const),
      sizeBytes: 1024,
    }));
    const parsed = thesisSubmissionSchema.safeParse({
      title: "Adaptive Systems Thesis",
      abstract: "A thesis about adaptive systems.",
      documents,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Upload one thesis document per submission.",
      );
    }

    await expect(
      submitThesis(
        {
          title: "Adaptive Systems Thesis",
          abstract: "A thesis about adaptive systems.",
          documents,
        },
        {
          uid: "firebase-student-1",
          userId: "user-student-1",
          firebaseUid: "firebase-student-1",
          role: "STUDENT",
          email: "student1@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Upload one thesis document per submission.",
    });
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a payload that supplies both legacy and array document fields", () => {
    const result = thesisSubmissionSchema.safeParse({
      title: "Adaptive Systems Thesis",
      abstract: "A thesis about adaptive systems.",
      document: {
        fileName: "legacy.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
      documents: [
        {
          fileName: "thesis.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Upload exactly one thesis document.",
      );
    }
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
