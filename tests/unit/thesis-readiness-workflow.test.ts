import {
  AcademicStatus,
  MilestoneStatus,
  ReadinessDecision,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ethics/department-record", () => ({
  assertEthicsGateSatisfied: vi.fn().mockResolvedValue({
    applicability: "NOT_REQUIRED",
    status: "EXEMPT",
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import {
  certifyThesisReadiness,
  recordHodReadinessDecision,
  requestThesisReadiness,
} from "@/lib/examination/department-workflow";
import { prisma } from "@/lib/prisma/client";

const studentAuth = {
  uid: "firebase-student-1",
  firebaseUid: "firebase-student-1",
  userId: "student-user-1",
  role: UserRole.STUDENT,
} as const;

function gateStudent() {
  return {
    id: "student-1",
    userId: "student-user-1",
    academicStatus: AcademicStatus.ACTIVE,
    registrations: [{ id: "registration-1" }],
    researchProposals: [{ id: "proposal-1" }],
    milestones: [
      { status: MilestoneStatus.APPROVED },
      { status: MilestoneStatus.APPROVED },
    ],
    supervisorAssignments: [
      { supervisorUserId: "supervisor-user-1" },
    ],
    theses: [],
  };
}

describe("three-party thesis-readiness workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Student request before any thesis record exists", async () => {
    const readinessCreate = vi.fn().mockResolvedValue({
      id: "readiness-1",
      studentId: "student-1",
      decision: ReadinessDecision.REQUESTED,
      updatedAt: new Date("2026-07-26T10:00:00.000Z"),
    });
    const studentFind = vi
      .fn()
      .mockResolvedValueOnce({
        id: "student-1",
        readinessCertifications: [],
      })
      .mockResolvedValueOnce(gateStudent());
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        student: { findUnique: studentFind },
        thesisReadinessCertification: { create: readinessCreate },
        lifecycleAuditEvent: { create: vi.fn().mockResolvedValue({}) },
        outboxMessage: { create: vi.fn().mockResolvedValue({}) },
      } as never),
    );

    await expect(
      requestThesisReadiness(
        { studentMessage: "My examination copy is ready." },
        studentAuth,
      ),
    ).resolves.toMatchObject({
      decision: ReadinessDecision.REQUESTED,
    });
    expect(readinessCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        decision: ReadinessDecision.REQUESTED,
      }),
    });
  });

  it("allows only a requested record to be certified by the primary Supervisor", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        thesisReadinessCertification: {
          findUnique: vi.fn().mockResolvedValue({
            id: "readiness-1",
            studentId: "student-1",
            decision: ReadinessDecision.RETURNED,
            student: {
              userId: "student-user-1",
              supervisorAssignments: [{ id: "assignment-1" }],
            },
          }),
        },
      } as never),
    );

    await expect(
      certifyThesisReadiness(
        "readiness-1",
        {
          decision: "CERTIFIED",
          checklist: { examinationCopy: true },
        },
        {
          uid: "firebase-supervisor-1",
          firebaseUid: "firebase-supervisor-1",
          userId: "supervisor-user-1",
          role: UserRole.SUPERVISOR,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Only a requested readiness record can be decided by the Supervisor.",
    });
  });

  it("records a separate HOD approval after Supervisor certification", async () => {
    const readinessUpdate = vi.fn().mockResolvedValue({
      id: "readiness-1",
      decision: ReadinessDecision.HOD_APPROVED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        thesisReadinessCertification: {
          findUnique: vi.fn().mockResolvedValue({
            id: "readiness-1",
            studentId: "student-1",
            decision: ReadinessDecision.CERTIFIED,
            student: { userId: "student-user-1" },
          }),
          update: readinessUpdate,
        },
        student: { findUnique: vi.fn().mockResolvedValue(gateStudent()) },
        lifecycleAuditEvent: { create: vi.fn().mockResolvedValue({}) },
        outboxMessage: { create: vi.fn().mockResolvedValue({}) },
      } as never),
    );

    await expect(
      recordHodReadinessDecision(
        "readiness-1",
        { decision: "APPROVED", notes: "Approved for examination submission." },
        {
          uid: "firebase-hod-1",
          firebaseUid: "firebase-hod-1",
          userId: "hod-user-1",
          role: UserRole.HOD,
        },
      ),
    ).resolves.toMatchObject({
      decision: ReadinessDecision.HOD_APPROVED,
    });
    expect(readinessUpdate).toHaveBeenCalledWith({
      where: { id: "readiness-1" },
      data: expect.objectContaining({
        decision: ReadinessDecision.HOD_APPROVED,
        hodApprovedByUserId: "hod-user-1",
        hodApprovedAt: expect.any(Date),
      }),
    });
  });
});
