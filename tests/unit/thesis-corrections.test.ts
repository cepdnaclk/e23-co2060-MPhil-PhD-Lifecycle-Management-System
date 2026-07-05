import {
  AcademicStatus,
  CorrectionType,
  ThesisStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyCorrectionSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyInBackground: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    administrator: {
      findUnique: vi.fn(),
    },
    correctionDocument: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  approveCorrectionDocument,
  submitCorrectionDocument,
  ThesisCorrectionError,
} from "@/lib/theses/corrections";
import { prisma } from "@/lib/prisma/client";

describe("thesis correction workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([ThesisStatus.UNDER_EXAMINATION, ThesisStatus.FINAL_ARCHIVE])(
    "blocks correction submission when the thesis status is %s",
    async (status) => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue({
        id: "student-1",
        academicStatus: AcademicStatus.ACTIVE,
        user: {
          id: "user-student-1",
          displayName: "Student One",
          email: "student1@example.com",
        },
        theses: [
          {
            id: "thesis-1",
            title: "Adaptive Systems Thesis",
            status,
            studentId: "student-1",
            corrections: [],
          },
        ],
      } as never);

      await expect(
        submitCorrectionDocument(
          "thesis-1",
          {
            correctionType: CorrectionType.MINOR,
            description: "Updated chapter 4.",
            document: {
              fileName: "correction.pdf",
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
      ).rejects.toMatchObject<ThesisCorrectionError>({
        status: 409,
        message:
          "Correction uploads are only allowed while the thesis status is CORRECTIONS_REQUIRED.",
      });
    },
  );

  it("does not graduate the student when a correction is only approved", async () => {
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

    const result = await approveCorrectionDocument(
      "thesis-1",
      "correction-1",
      {
        uid: "firebase-admin-1",
        userId: "user-admin-1",
        firebaseUid: "firebase-admin-1",
        role: "ADMINISTRATOR",
        email: "admin@example.com",
      },
    );

    expect(result).toMatchObject({
      id: "correction-1",
      isApproved: true,
    });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });
});
