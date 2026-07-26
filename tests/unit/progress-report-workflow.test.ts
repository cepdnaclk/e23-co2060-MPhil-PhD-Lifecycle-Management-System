import { DocumentType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  notifyInBackground: vi.fn(),
}));

vi.mock("@/lib/uploads/sessions", () => ({
  createStagedUploadSession: vi.fn(),
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    status = 409;
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    progressReport: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { notifyInBackground } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import { markOverdueProgressReports } from "@/lib/progress-reports/maintenance";
import { submitProgressReport } from "@/lib/progress-reports/submission";
import { verifyUploadSessionForFinalize } from "@/lib/uploads/sessions";

describe("progress report workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates documents only after staged bytes are verified and then notifies the supervisor", async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: "student-1",
      user: {
        id: "user-student-1",
        displayName: "Student One",
      },
      registrations: [{ id: "registration-1" }],
      supervisorAssignments: [
        {
          supervisor: {
            user: {
              id: "user-supervisor-1",
              displayName: "Dr. Primary",
              email: "primary@example.com",
              isActive: true,
            },
          },
        },
      ],
    } as never);
    vi.mocked(verifyUploadSessionForFinalize).mockResolvedValue({
      state: "VERIFIED",
      session: {
        id: "d8e54622-7149-49e8-95d8-37d2d6206db5",
        manifestHash: "manifest-1",
        files: [
          {
            id: "staged-1",
            ordinal: 0,
            fileName: "report.pdf",
            storagePath:
              "progress-reports/student-1/staged/session-1/file-1/report.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            checksumSha256: "a".repeat(64),
          },
        ],
      },
    } as never);

    const progressReportCreate = vi.fn().mockResolvedValue({
      id: "report-1",
      studentId: "student-1",
      periodLabel: "2026 Q1",
      narrative: "Progress narrative",
      status: "SUBMITTED",
      isOverdue: false,
      createdAt: new Date("2026-05-01T08:00:00.000Z"),
      updatedAt: new Date("2026-05-01T08:00:00.000Z"),
    });
    const documentCreate = vi.fn().mockResolvedValue({
      id: "document-1",
      fileName: "report.pdf",
      storagePath:
        "progress-reports/student-1/staged/session-1/file-1/report.pdf",
      mimeType: "application/pdf",
      version: 1,
      isCurrentVersion: true,
      createdAt: new Date("2026-05-01T08:00:00.000Z"),
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        progressReport: { create: progressReportCreate },
        document: { create: documentCreate },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
      } as never),
    );

    const result = await submitProgressReport(
      {
        periodLabel: "2026 Q1",
        narrative:
          "This progress narrative is intentionally long enough to pass the shared validation rule for progress reports.",
        uploadSessionId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student1@example.com",
      },
    );

    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentType: DocumentType.PROGRESS_REPORT,
          verificationStatus: "VERIFIED",
          checksumSha256: "a".repeat(64),
        }),
      }),
    );
    expect(notifyInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "PROGRESS_REPORT_SUBMITTED",
        recipientUserId: "user-supervisor-1",
      }),
    );
    expect(result.report.documents).toHaveLength(1);
  });

  it("marks unsigned old progress reports as overdue", async () => {
    vi.mocked(prisma.progressReport.updateMany).mockResolvedValue({
      count: 2,
    } as never);

    const count = await markOverdueProgressReports(
      new Date("2026-07-01T00:00:00.000Z"),
      30,
    );

    expect(count).toBe(2);
    expect(prisma.progressReport.updateMany).toHaveBeenCalledWith({
      where: {
        isArchived: false,
        status: {
          in: ["DRAFT", "SUBMITTED", "RETURNED"],
        },
        isOverdue: false,
        createdAt: {
          lt: new Date("2026-06-01T00:00:00.000Z"),
        },
      },
      data: {
        isOverdue: true,
      },
    });
  });
});
