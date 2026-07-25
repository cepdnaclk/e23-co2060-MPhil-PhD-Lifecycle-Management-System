import { DocumentType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  notifyInBackground: vi.fn(),
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");

  return {
    ...actual,
    generateUploadSignedUrl: vi.fn().mockResolvedValue(
      "https://storage.example.test/write?path=progress-reports%2Fstudent-1%2Freport-1%2Freport.pdf",
    ),
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
    progressReport: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { notifyInBackground } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import { markOverdueProgressReports } from "@/lib/progress-reports/maintenance";
import { submitProgressReport } from "@/lib/progress-reports/submission";
import { generateUploadSignedUrl } from "@/lib/storage";

describe("progress report workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a progress report document and notifies the primary supervisor", async () => {
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

    const progressReportCreate = vi.fn().mockResolvedValue({
      id: "report-1",
      studentId: "student-1",
      periodLabel: "2026 Q1",
      narrative:
        "This progress narrative is intentionally long enough to pass the shared validation rule for progress reports.",
      isSupervisorSignedOff: false,
      isOverdue: false,
      createdAt: new Date("2026-05-01T08:00:00.000Z"),
      updatedAt: new Date("2026-05-01T08:00:00.000Z"),
    });
    const documentCreate = vi.fn().mockResolvedValue({
      id: "document-1",
      fileName: "report.pdf",
      storagePath: "progress-reports/student-1/report-1/report.pdf",
      mimeType: "application/pdf",
      version: 1,
      isCurrentVersion: true,
      createdAt: new Date("2026-05-01T08:00:00.000Z"),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        progressReport: {
          create: progressReportCreate,
        },
        document: {
          create: documentCreate,
        },
      } as never),
    );

    const result = await submitProgressReport(
      {
        periodLabel: "2026 Q1",
        narrative:
          "This progress narrative is intentionally long enough to pass the shared validation rule for progress reports.",
        documents: [],
        document: {
          fileName: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: "STUDENT",
        email: "student1@example.com",
      },
    );

    expect(progressReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          periodLabel: "2026 Q1",
          isOverdue: false,
        }),
      }),
    );
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentType: DocumentType.PROGRESS_REPORT,
          studentId: "student-1",
          progressReportId: "report-1",
          storagePath: "progress-reports/student-1/report-1/report.pdf",
        }),
      }),
    );
    expect(generateUploadSignedUrl).toHaveBeenCalledWith(
      "progress-reports/student-1/report-1/report.pdf",
      "application/pdf",
    );
    expect(notifyInBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "PROGRESS_REPORT_SUBMITTED",
        recipientUserId: "user-supervisor-1",
        studentId: "student-1",
        periodLabel: "2026 Q1",
      }),
    );
    expect(result).toMatchObject({
      report: {
        id: "report-1",
        documents: [
          {
            id: "document-1",
            storagePath: "progress-reports/student-1/report-1/report.pdf",
          },
        ],
      },
      upload: {
        storagePath: "progress-reports/student-1/report-1/report.pdf",
      },
    });
  });

  it("marks unsigned old progress reports as overdue", async () => {
    vi.mocked(prisma.progressReport.updateMany).mockResolvedValue({ count: 2 } as never);

    const count = await markOverdueProgressReports(
      new Date("2026-07-01T00:00:00.000Z"),
      30,
    );

    expect(count).toBe(2);
    expect(prisma.progressReport.updateMany).toHaveBeenCalledWith({
      where: {
        isArchived: false,
        isSupervisorSignedOff: false,
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
