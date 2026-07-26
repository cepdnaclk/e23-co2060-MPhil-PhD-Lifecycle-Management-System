import {
  AcademicStatus,
  DocumentType,
  MilestoneStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/uploads/sessions", () => ({
  reopenUploadSessionAfterFinalizeFailure: vi.fn(),
  verifyUploadSessionForFinalize: vi.fn(),
  UploadSessionError: class UploadSessionError extends Error {
    status = 409;
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    progressReport: {
      findUnique: vi.fn(),
    },
    studentMilestone: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma/client";
import { markOverdueProgressMilestones } from "@/lib/progress-reports/maintenance";
import { submitMilestoneProgress } from "@/lib/progress-reports/milestone-workflow";
import { verifyUploadSessionForFinalize } from "@/lib/uploads/sessions";

describe("fixed milestone progress workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds verified evidence to the exact immutable milestone version", async () => {
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

    const reportCreate = vi.fn().mockResolvedValue({
      id: "report-1",
      currentVersion: 1,
    });
    const documentCreate = vi.fn().mockResolvedValue({ id: "document-1" });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        studentMilestone: {
          findUnique: vi.fn().mockResolvedValue({
            id: "milestone-1",
            sequenceNumber: 1,
            dueDate: new Date("2026-07-01T00:00:00.000Z"),
            status: MilestoneStatus.DUE,
            progressReport: null,
            student: {
              id: "student-1",
              userId: "user-student-1",
              academicStatus: AcademicStatus.ACTIVE,
              registrations: [{ id: "registration-1" }],
              milestones: [
                { sequenceNumber: 1, status: MilestoneStatus.DUE },
              ],
              supervisorAssignments: [
                { supervisorUserId: "user-supervisor-1" },
              ],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        progressReport: { create: reportCreate },
        document: {
          create: documentCreate,
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        stagedUploadFile: { update: vi.fn().mockResolvedValue({}) },
        uploadSession: { update: vi.fn().mockResolvedValue({}) },
        lifecycleAuditEvent: { create: vi.fn().mockResolvedValue({}) },
        outboxMessage: { create: vi.fn().mockResolvedValue({}) },
      } as never),
    );

    await submitMilestoneProgress(
      "milestone-1",
      {
        narrative:
          "This immutable milestone narrative records completed work and the next planned research activities.",
        uploadSessionId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
      },
      {
        uid: "firebase-student-1",
        userId: "user-student-1",
        firebaseUid: "firebase-student-1",
        role: UserRole.STUDENT,
      },
    );

    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          milestoneId: "milestone-1",
          periodLabel: "Milestone 1",
          versions: {
            create: expect.objectContaining({
              versionNumber: 1,
              submittedByUserId: "user-student-1",
            }),
          },
        }),
      }),
    );
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentType: DocumentType.PROGRESS_REPORT,
          progressReportId: "report-1",
          progressReportVersionId: expect.any(String),
          verificationStatus: "VERIFIED",
          checksumSha256: "a".repeat(64),
        }),
      }),
    );
  });

  it("marks past-due incomplete milestones as overdue", async () => {
    vi.mocked(prisma.studentMilestone.updateMany).mockResolvedValue({
      count: 2,
    } as never);

    const count = await markOverdueProgressMilestones(
      new Date("2026-07-01T00:00:00.000Z"),
    );

    expect(count).toBe(2);
    expect(prisma.studentMilestone.updateMany).toHaveBeenCalledWith({
      where: {
        dueDate: {
          lt: new Date("2026-07-01T00:00:00.000Z"),
        },
        status: {
          in: [
            MilestoneStatus.SCHEDULED,
            MilestoneStatus.DUE,
          ],
        },
      },
      data: {
        status: MilestoneStatus.OVERDUE,
      },
    });
  });
});
