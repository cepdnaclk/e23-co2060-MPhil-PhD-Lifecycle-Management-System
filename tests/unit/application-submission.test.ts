import {
  AcademicStatus,
  ApplicationStatus,
  ProgramType,
  RegistrationStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  createFirebaseAuthUser: vi.fn(),
  deleteFirebaseAuthUser: vi.fn(),
  setCustomClaimsForUser: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  notifyApplicationSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  notifyWelcomeAccountCreated: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  ApplicationSubmissionError,
  applicationSubmissionSchema,
  assertValidApplicationUploadFile,
  updateApplicationStatus,
} from "@/lib/applications/submission";
import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  setCustomClaimsForUser,
} from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma/client";

describe("application submission utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-PDF supporting file", () => {
    expect(() =>
      assertValidApplicationUploadFile({
        draftId: "draft-1",
        fileName: "proposal.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSizeBytes: 1024,
      }),
    ).toThrow("Only PDF documents are allowed.");
  });

  it("rejects a PDF larger than 10MB", () => {
    expect(() =>
      assertValidApplicationUploadFile({
        draftId: "draft-2",
        fileName: "large.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 11 * 1024 * 1024,
      }),
    ).toThrow("File exceeds the 10MB upload limit.");
  });

  it("rejects a submission schema payload with an oversized uploaded document", () => {
    const result = applicationSubmissionSchema.safeParse({
      applicantName: "Applicant One",
      applicantEmail: "applicant@example.com",
      applicantPhone: "+94770000000",
      programType: "MPHIL",
      researchArea: "AI",
      statementOfPurpose:
        "I want to pursue a long-term research problem in adaptive systems for education.",
      supportingDocuments: [
        {
          fileName: "oversized.pdf",
          storagePath: "applications/draft-3/oversized.pdf",
          mimeType: "application/pdf",
          sizeBytes: 11 * 1024 * 1024,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a submission schema payload with more than one supporting document", () => {
    const result = applicationSubmissionSchema.safeParse({
      applicantName: "Applicant One",
      applicantEmail: "applicant@example.com",
      applicantPhone: "+94770000000",
      programType: "MPHIL",
      researchArea: "AI",
      statementOfPurpose:
        "I want to pursue a long-term research problem in adaptive systems for education.",
      supportingDocuments: [
        {
          fileName: "cv.pdf",
          storagePath: "applications/draft-4/cv.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        {
          fileName: "transcript.pdf",
          storagePath: "applications/draft-4/transcript.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
      ],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Upload only one supporting document.",
      );
    }
  });

  it("blocks an illegal REJECTED to SUBMITTED transition with a 400 error", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue({
      id: "application-1",
      status: ApplicationStatus.REJECTED,
    } as never);

    await expect(
      updateApplicationStatus("application-1", ApplicationStatus.SUBMITTED),
    ).rejects.toMatchObject<ApplicationSubmissionError>({
      status: 400,
      message: "Invalid application status transition: REJECTED -> SUBMITTED",
    });
  });

  it("deletes the Firebase user if the admission database transaction fails", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue({
      id: "application-admit-1",
      status: ApplicationStatus.UNDER_REVIEW,
      applicantName: "Applicant Admit",
      applicantEmail: "admit@example.com",
      programType: ProgramType.MPHIL,
      studentId: null,
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-student-1",
    } as never);
    vi.mocked(setCustomClaimsForUser).mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB transaction failed"));

    await expect(
      updateApplicationStatus("application-admit-1", ApplicationStatus.ADMITTED),
    ).rejects.toMatchObject<ApplicationSubmissionError>({
      status: 500,
      message: "DB transaction failed",
    });

    expect(createFirebaseAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admit@example.com",
      }),
    );
    expect(setCustomClaimsForUser).toHaveBeenCalledWith(
      "firebase-student-1",
      "STUDENT",
    );
    expect(deleteFirebaseAuthUser).toHaveBeenCalledWith("firebase-student-1");
  });

  it("creates student, registration, and admitted application records in one admission flow", async () => {
    vi.mocked(prisma.application.findUnique)
      .mockResolvedValueOnce({
        id: "application-admit-2",
        status: ApplicationStatus.UNDER_REVIEW,
        applicantName: "Applicant Success",
        applicantEmail: "success@example.com",
        programType: ProgramType.PHD,
        studentId: null,
      } as never)
      .mockResolvedValueOnce({
        id: "application-admit-2",
        status: ApplicationStatus.ADMITTED,
      } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-student-2",
    } as never);
    vi.mocked(setCustomClaimsForUser).mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user-student-2",
            email: "success@example.com",
            displayName: "Applicant Success",
            role: UserRole.STUDENT,
            isActive: true,
            firebaseUid: "firebase-student-2",
          }),
        },
        student: {
          create: vi.fn().mockResolvedValue({
            id: "student-2",
            academicStatus: AcademicStatus.ACTIVE,
            programType: ProgramType.PHD,
          }),
        },
        registration: {
          create: vi.fn().mockResolvedValue({
            id: "registration-2",
            status: RegistrationStatus.ACTIVE,
          }),
        },
        application: {
          update: vi.fn().mockResolvedValue({
            id: "application-admit-2",
            status: ApplicationStatus.ADMITTED,
            studentId: "student-2",
          }),
        },
      };

      const result = await callback(tx as never);

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.STUDENT,
            firebaseUid: "firebase-student-2",
          }),
        }),
      );
      expect(tx.student.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-student-2",
            academicStatus: AcademicStatus.ACTIVE,
            programType: ProgramType.PHD,
          }),
        }),
      );
      expect(tx.registration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: "student-2",
            status: RegistrationStatus.ACTIVE,
          }),
        }),
      );

      return result;
    });
    vi.mocked(prisma.application.findUniqueOrThrow).mockResolvedValue({
      id: "application-admit-2",
      status: ApplicationStatus.ADMITTED,
      studentId: "student-2",
    } as never);

    const result = await updateApplicationStatus(
      "application-admit-2",
      ApplicationStatus.ADMITTED,
    );

    expect(result).toMatchObject({
      id: "application-admit-2",
      status: ApplicationStatus.ADMITTED,
    });
  });
});
