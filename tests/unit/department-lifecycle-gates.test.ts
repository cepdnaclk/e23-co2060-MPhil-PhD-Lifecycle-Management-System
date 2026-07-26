import {
  EthicsApplicability,
  EthicsRecordStatus,
  ProgressSubmissionStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
    supervisorAssignment: {
      findFirst: vi.fn(),
    },
  },
}));

import { recordProgrammeCompletion } from "@/lib/completion/department-workflow";
import { assertEthicsGateSatisfied } from "@/lib/ethics/department-record";
import { recordHodVivaOutcome } from "@/lib/examination/department-workflow";
import { prisma } from "@/lib/prisma/client";
import { decideMilestoneProgress } from "@/lib/progress-reports/milestone-workflow";

describe("Department lifecycle gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a recorded NOT_REQUIRED/EXEMPT ethics gate", async () => {
    const record = {
      id: "ethics-1",
      applicability: EthicsApplicability.NOT_REQUIRED,
      status: EthicsRecordStatus.EXEMPT,
      validUntil: null,
    };
    const findFirst = vi.fn().mockResolvedValue(record);

    await expect(
      assertEthicsGateSatisfied(
        { ethicsApproval: { findFirst } } as never,
        "student-1",
      ),
    ).resolves.toBe(record);
  });

  it("rejects progress decisions by a non-primary supervisor", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        progressReport: {
          findUnique: vi.fn().mockResolvedValue({
            id: "report-1",
            status: ProgressSubmissionStatus.SUBMITTED,
            milestone: { id: "milestone-1" },
            student: {
              id: "student-1",
              userId: "student-user-1",
              supervisorAssignments: [],
            },
          }),
        },
      } as never),
    );

    await expect(
      decideMilestoneProgress(
        "report-1",
        { decision: "APPROVE" },
        {
          uid: "firebase-supervisor",
          firebaseUid: "firebase-supervisor",
          userId: "supervisor-user-1",
          role: UserRole.SUPERVISOR,
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "You are not the active primary supervisor for this student.",
    });
  });

  it("requires at least two complete independent examiner records for HOD outcome", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        viva: {
          findUnique: vi.fn().mockResolvedValue({
            id: "viva-1",
            hodOutcome: null,
            thesis: {
              examinerAssignments: [
                {
                  report: { id: "report-1" },
                  vivaRecommendation: { id: "recommendation-1" },
                },
              ],
            },
          }),
        },
      } as never),
    );

    await expect(
      recordHodVivaOutcome(
        "viva-1",
        {
          outcome: "PASS",
          reason: "The independent recommendations support this outcome.",
        },
        {
          uid: "firebase-hod",
          firebaseUid: "firebase-hod",
          userId: "hod-user-1",
          role: UserRole.HOD,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "All confirmed examiners must submit independent reports and recommendations.",
    });
  });

  it("prevents admin completion before HOD approval", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        programmeCompletion: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as never),
    );

    await expect(
      recordProgrammeCompletion("student-1", {
        uid: "firebase-admin",
        firebaseUid: "firebase-admin",
        userId: "admin-user-1",
        role: UserRole.ADMINISTRATOR,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "HOD completion approval is required.",
    });
  });
});
