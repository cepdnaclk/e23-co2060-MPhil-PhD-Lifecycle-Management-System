import {
  ApplicationStatus,
  ProgramType,
  StudyMode,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
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
  generateFirebasePasswordSetupLink: vi.fn(),
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
  SESSION_COOKIE_MAX_AGE_SECONDS: 432000,
  SESSION_COOKIE_NAME: "pglms_session",
}));

vi.mock("@/lib/uploads/capabilities", () => ({
  requirePublicApplicationDraft: vi.fn(),
  PublicDraftCapabilityError: class PublicDraftCapabilityError extends Error {
    status = 403;
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    application: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    supervisor: {
      findUnique: vi.fn(),
    },
    uploadSession: {
      updateMany: vi.fn(),
    },
    stagedUploadFile: {
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/applications/route";
import { updateApplicationStatus } from "@/lib/applications/submission";
import { notifyApplicationSubmittedToAdministrator } from "@/lib/email";
import { generateFirebasePasswordSetupLink } from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma/client";
import { requirePublicApplicationDraft } from "@/lib/uploads/capabilities";

describe("application submission integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateFirebasePasswordSetupLink).mockResolvedValue(
      "https://identity.example/setup-account",
    );
  });

  it("creates a SUBMITTED application record and notifies administrators", async () => {
    vi.mocked(requirePublicApplicationDraft).mockResolvedValue({
      id: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      status: "OPEN",
      finalizedEntityId: null,
      files: [
        {
          id: "staged-1",
          ordinal: 0,
          fileName: "cv.pdf",
          storagePath:
            "applications/d8e54622-7149-49e8-95d8-37d2d6206db5/staged/file/cv.pdf",
          status: "VERIFIED",
          actualMimeType: "application/pdf",
          actualSizeBytes: 256000,
          actualSha256: "a".repeat(64),
        },
      ],
    } as never);
    vi.mocked(prisma.uploadSession.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.supervisor.findUnique).mockResolvedValue({
      id: "supervisor-1",
      userId: "supervisor-user-1",
      user: { isActive: true },
    } as never);
    vi.mocked(prisma.stagedUploadFile.update).mockResolvedValue({} as never);
    let applicationCreate = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      applicationCreate = vi.fn().mockResolvedValue({ id: "application-100" });
      return callback({
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: applicationCreate,
        },
        stagedUploadFile: {
          update: vi.fn().mockResolvedValue({}),
        },
        uploadSession: {
          update: vi.fn().mockResolvedValue({}),
        },
        lifecycleAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
        outboxMessage: {
          create: vi.fn().mockResolvedValue({ id: "outbox-1" }),
        },
      } as never);
    });
    vi.mocked(prisma.application.findUniqueOrThrow).mockResolvedValue({
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
          origin: "http://localhost",
        },
        body: JSON.stringify({
          draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
          draftToken: "a".repeat(43),
          applicantName: "Applicant Example",
          applicantEmail: "applicant@example.com",
          applicantPhone: "+94770000000",
          programType: ProgramType.MPHIL,
          studyMode: StudyMode.FULL_TIME,
          proposalTitle: "Adaptive research supervision systems",
          proposalAbstract:
            "A study of adaptive research supervision systems for postgraduate lifecycle support.",
          proposedSupervisorId: "supervisor-1",
          researchArea: "Educational Data Mining",
          statementOfPurpose:
            "I plan to investigate adaptive research supervision systems for postgraduate students.",
          supportingDocuments: [
            {
              fileName: "cv.pdf",
              storagePath:
                "applications/d8e54622-7149-49e8-95d8-37d2d6206db5/staged/file/cv.pdf",
              mimeType: "application/pdf",
              sizeBytes: 256000,
            },
          ],
        }),
      }),
    );

    expect(
      response.status,
      JSON.stringify(await response.clone().json()),
    ).toBe(201);
    expect(applicationCreate).toHaveBeenCalledWith(
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

  it("blocks the retired generic admission transition", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue({
      id: "application-login-1",
      status: ApplicationStatus.UNDER_REVIEW,
    } as never);
    await expect(
      updateApplicationStatus(
        "application-login-1",
        ApplicationStatus.ADMITTED,
      ),
    ).rejects.toMatchObject({ status: 410 });
  });
});
