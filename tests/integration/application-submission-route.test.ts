import {
  ApplicationStatus,
  ProgramType,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyApplicationSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  notifyWelcomeAccountCreated: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/firebase/admin", () => ({
  createFirebaseAuthUser: vi.fn(),
  deleteFirebaseAuthUser: vi.fn(),
  setCustomClaimsForUser: vi.fn(),
  verifyFirebaseToken: vi.fn(),
  createSessionCookieFromIdToken: vi.fn().mockResolvedValue("session-cookie"),
  buildSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1800,
  })),
  SESSION_COOKIE_NAME: "pgsms_session",
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    application: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST as createSession } from "@/app/api/auth/session/route";
import { POST } from "@/app/api/applications/route";
import { updateApplicationStatus } from "@/lib/applications/submission";
import { notifyApplicationSubmittedToAdministrator } from "@/lib/email";
import {
  createFirebaseAuthUser,
  setCustomClaimsForUser,
  verifyFirebaseToken,
} from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma/client";

describe("application submission integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a SUBMITTED application record and notifies administrators", async () => {
    vi.mocked(prisma.application.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.application.create).mockResolvedValue({
      id: "application-100",
      status: ApplicationStatus.SUBMITTED,
      applicantName: "Applicant Example",
      applicantEmail: "applicant@example.com",
      researchArea: "Educational Data Mining",
      programType: ProgramType.MPHIL,
      documents: [],
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "admin-1",
        displayName: "Admissions Admin",
        email: "admin@example.com",
      },
    ] as never);

    const response = await POST(
      new Request("http://localhost/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicantName: "Applicant Example",
          applicantEmail: "applicant@example.com",
          applicantPhone: "+94770000000",
          programType: ProgramType.MPHIL,
          researchArea: "Educational Data Mining",
          statementOfPurpose:
            "I plan to investigate adaptive research supervision systems for postgraduate students.",
          supportingDocuments: [
            {
              fileName: "cv.pdf",
              storagePath: "applications/draft-100/cv.pdf",
              mimeType: "application/pdf",
              sizeBytes: 256000,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApplicationStatus.SUBMITTED,
        }),
      }),
    );
    expect(notifyApplicationSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "admin-1",
        applicantEmail: "applicant@example.com",
      }),
    );
  });

  it("allows the newly admitted student to create a session immediately after admission", async () => {
    vi.mocked(prisma.application.findUnique)
      .mockResolvedValueOnce({
        id: "application-login-1",
        status: ApplicationStatus.UNDER_REVIEW,
        applicantName: "Login Student",
        applicantEmail: "student@login.example",
        programType: ProgramType.MPHIL,
        studentId: null,
      } as never)
      .mockResolvedValueOnce({
        id: "application-login-1",
        status: ApplicationStatus.ADMITTED,
        studentId: "student-login-1",
      } as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "user-login-1",
        isActive: true,
        role: UserRole.STUDENT,
        firebaseUid: "firebase-login-1",
      } as never);
    vi.mocked(createFirebaseAuthUser).mockResolvedValue({
      uid: "firebase-login-1",
    } as never);
    vi.mocked(setCustomClaimsForUser).mockResolvedValue(undefined);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user-login-1",
            email: "student@login.example",
            displayName: "Login Student",
            role: UserRole.STUDENT,
            isActive: true,
            firebaseUid: "firebase-login-1",
          }),
        },
        student: {
          create: vi.fn().mockResolvedValue({
            id: "student-login-1",
          }),
        },
        registration: {
          create: vi.fn().mockResolvedValue({
            id: "registration-login-1",
          }),
        },
        application: {
          update: vi.fn().mockResolvedValue({
            id: "application-login-1",
            status: ApplicationStatus.ADMITTED,
            studentId: "student-login-1",
          }),
        },
      };

      return callback(tx as never);
    });
    vi.mocked(prisma.application.findUniqueOrThrow).mockResolvedValue({
      id: "application-login-1",
      status: ApplicationStatus.ADMITTED,
      studentId: "student-login-1",
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(verifyFirebaseToken).mockResolvedValue({
      uid: "firebase-login-1",
      role: "STUDENT",
    } as never);

    await updateApplicationStatus(
      "application-login-1",
      ApplicationStatus.ADMITTED,
    );

    const response = await createSession(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken: "student-id-token",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      role: UserRole.STUDENT,
    });
  });
});
