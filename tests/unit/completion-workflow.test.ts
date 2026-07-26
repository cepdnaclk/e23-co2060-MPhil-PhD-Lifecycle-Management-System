import {
  AcademicStatus,
  ArchiveStatus,
  CompletionStatus,
  DocumentVerificationStatus,
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowStage,
  ExaminerRecommendation,
  GraduationStatus,
  MilestoneStatus,
  ProgramType,
  RegistrationStatus,
  StudyMode,
  ThesisStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import {
  approveProgrammeCompletion,
  archiveStudentRecord,
  recordGraduation,
  recordProgrammeCompletion,
} from "@/lib/completion/department-workflow";
import { prisma } from "@/lib/prisma/client";

const hodAuth = {
  uid: "firebase-hod",
  firebaseUid: "firebase-hod",
  userId: "hod-user-1",
  role: UserRole.HOD,
};

const adminAuth = {
  uid: "firebase-admin",
  firebaseUid: "firebase-admin",
  userId: "admin-user-1",
  role: UserRole.ADMINISTRATOR,
};

function verifiedCompletionEvidence(
  programmeCompletion: Record<string, unknown> | null = null,
) {
  return {
    id: "student-1",
    userId: "student-user-1",
    programType: ProgramType.MPHIL,
    studyMode: StudyMode.FULL_TIME,
    academicStatus: AcademicStatus.ACTIVE,
    isArchived: false,
    user: {
      id: "student-user-1",
      displayName: "Student One",
    },
    milestones: Array.from({ length: 4 }, (_, index) => ({
      id: `milestone-${index + 1}`,
      sequenceNumber: index + 1,
      status: MilestoneStatus.APPROVED,
    })),
    registrations: [
      {
        id: "registration-1",
        status: RegistrationStatus.ACTIVE,
      },
    ],
    programmeCompletion,
    theses: [
      {
        id: "thesis-1",
        status: ThesisStatus.UNDER_EXAMINATION,
        versions: [
          {
            id: "thesis-version-2",
            versionNumber: 2,
            manifestHash: "manifest-hash",
            documents: [
              {
                id: "document-1",
                checksumSha256: "checksum",
                verificationStatus: DocumentVerificationStatus.VERIFIED,
              },
            ],
          },
        ],
        viva: {
          id: "viva-1",
          hodOutcome: ExaminerRecommendation.PASS,
          correctionOrders: [],
        },
      },
    ],
  };
}

function ethicsGateRecord() {
  return {
    id: "ethics-1",
    applicability: EthicsApplicability.NOT_REQUIRED,
    status: EthicsRecordStatus.EXEMPT,
    workflowStage: EthicsWorkflowStage.COMPLETED,
    validUntil: null,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    student: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ethicsApproval: {
      findFirst: vi.fn().mockResolvedValue(ethicsGateRecord()),
      updateMany: vi.fn(),
    },
    programmeCompletion: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    graduationRecord: {
      create: vi.fn(),
    },
    studentArchiveRecord: {
      create: vi.fn(),
    },
    viva: {
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: "admin-user-1" }]),
    },
    registration: {
      updateMany: vi.fn(),
    },
    thesis: {
      update: vi.fn(),
    },
    application: {
      updateMany: vi.fn(),
    },
    progressReport: {
      updateMany: vi.fn(),
    },
    researchProposal: {
      updateMany: vi.fn(),
    },
    lifecycleAuditEvent: {
      create: vi.fn(),
    },
    outboxMessage: {
      create: vi.fn(),
    },
    ...overrides,
  };
}

describe("Department completion workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks HOD approval until every fixed milestone is complete", async () => {
    const tx = transaction();
    const evidence = verifiedCompletionEvidence();
    evidence.milestones = evidence.milestones.slice(0, 3);
    tx.student.findUnique.mockResolvedValue(evidence);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      approveProgrammeCompletion(
        "student-1",
        "All academic completion evidence has been reviewed.",
        hodAuth,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "All 4 fixed milestones must be completed.",
    });
    expect(tx.programmeCompletion.upsert).not.toHaveBeenCalled();
  });

  it("binds HOD approval to the exact verified current thesis version", async () => {
    const tx = transaction();
    tx.student.findUnique.mockResolvedValue(verifiedCompletionEvidence());
    tx.programmeCompletion.upsert.mockResolvedValue({
      id: "completion-1",
      studentId: "student-1",
      thesisId: "thesis-1",
      thesisVersionId: "thesis-version-2",
      status: CompletionStatus.HOD_APPROVED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await approveProgrammeCompletion(
      "student-1",
      "All academic completion evidence has been reviewed.",
      hodAuth,
    );

    expect(tx.programmeCompletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          thesisId: "thesis-1",
          thesisVersionId: "thesis-version-2",
          status: CompletionStatus.HOD_APPROVED,
        }),
      }),
    );
    expect(tx.viva.update).toHaveBeenCalledWith({
      where: { id: "viva-1" },
      data: { programmeCompletionId: "completion-1" },
    });
    expect(tx.outboxMessage.create).toHaveBeenCalledTimes(2);
  });

  it("executes completion across Student, registration, and thesis atomically", async () => {
    const approval = {
      id: "completion-1",
      studentId: "student-1",
      thesisId: "thesis-1",
      thesisVersionId: "thesis-version-2",
      status: CompletionStatus.HOD_APPROVED,
    };
    const tx = transaction();
    tx.programmeCompletion.findUnique.mockResolvedValue(approval);
    tx.student.findUnique.mockResolvedValue(
      verifiedCompletionEvidence(approval),
    );
    tx.programmeCompletion.update.mockResolvedValue({
      ...approval,
      status: CompletionStatus.COMPLETED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await recordProgrammeCompletion("student-1", adminAuth);

    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        academicStatus: AcademicStatus.COMPLETED,
        updatedBy: "admin-user-1",
      },
    });
    expect(tx.registration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RegistrationStatus.COMPLETED,
        }),
      }),
    );
    expect(tx.thesis.update).toHaveBeenCalledWith({
      where: { id: "thesis-1" },
      data: { status: ThesisStatus.COMPLETED },
    });
  });

  it("records graduation only with completed status and external confirmation", async () => {
    const tx = transaction();
    tx.student.findUnique.mockResolvedValue({
      id: "student-1",
      userId: "student-user-1",
      academicStatus: AcademicStatus.COMPLETED,
      user: { id: "student-user-1" },
      programmeCompletion: {
        id: "completion-1",
        status: CompletionStatus.COMPLETED,
      },
      graduationRecord: null,
      archiveRecord: null,
    });
    tx.graduationRecord.create.mockResolvedValue({
      id: "graduation-1",
      studentId: "student-1",
      status: GraduationStatus.GRADUATED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await recordGraduation(
      "student-1",
      {
        graduationDate: new Date("2026-07-01T00:00:00.000Z"),
        confirmationReference: "Department minute 2026/07/15",
        notes: "Confirmation received.",
      },
      adminAuth,
    );

    expect(tx.graduationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        confirmationReference: "Department minute 2026/07/15",
        recordedByUserId: "admin-user-1",
      }),
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        academicStatus: AcademicStatus.GRADUATED,
        updatedBy: "admin-user-1",
      },
    });
  });

  it("archives lifecycle state without deleting documents or changing Firebase", async () => {
    const tx = transaction();
    tx.student.findUnique.mockResolvedValue({
      id: "student-1",
      userId: "student-user-1",
      academicStatus: AcademicStatus.GRADUATED,
      user: { id: "student-user-1" },
      programmeCompletion: {
        id: "completion-1",
        thesisId: "thesis-1",
        status: CompletionStatus.COMPLETED,
      },
      graduationRecord: {
        id: "graduation-1",
        status: GraduationStatus.GRADUATED,
      },
      archiveRecord: null,
    });
    tx.studentArchiveRecord.create.mockResolvedValue({
      id: "archive-1",
      studentId: "student-1",
      status: ArchiveStatus.ARCHIVED,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await archiveStudentRecord(
      "student-1",
      "Lifecycle complete and graduation confirmed.",
      adminAuth,
    );

    expect(tx.thesis.update).toHaveBeenCalledWith({
      where: { id: "thesis-1" },
      data: {
        status: ThesisStatus.ARCHIVED,
        isArchived: true,
      },
    });
    expect(tx.registration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RegistrationStatus.ARCHIVED,
        }),
      }),
    );
    expect(tx).not.toHaveProperty("document.deleteMany");
    expect(tx.user).not.toHaveProperty("update");
  });
});
