import {
  AcademicStatus,
  MilestoneStatus,
  ProgramType,
  StudyMode,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    lifecycleAuditEvent: {
      create: vi.fn(),
    },
  },
}));

import {
  exportDepartmentProgressTable,
  listDepartmentProgressTable,
} from "@/lib/progress/department-tables";
import { prisma } from "@/lib/prisma/client";

const adminAuth = {
  uid: "firebase-admin",
  userId: "admin-user",
  firebaseUid: "firebase-admin",
  role: UserRole.ADMINISTRATOR,
  email: "admin@example.com",
} as const;

const studentRow = {
  id: "student-1",
  programType: ProgramType.MPHIL,
  studyMode: StudyMode.FULL_TIME,
  academicStatus: AcademicStatus.ACTIVE,
  enrollmentDate: new Date("2026-01-31T00:00:00.000Z"),
  expectedCompletionDate: new Date("2028-01-31T00:00:00.000Z"),
  user: { displayName: "=Formula Student" },
  milestones: [
    {
      sequenceNumber: 1,
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      status: MilestoneStatus.APPROVED,
    },
    {
      sequenceNumber: 2,
      dueDate: new Date("2027-01-31T00:00:00.000Z"),
      status: MilestoneStatus.SCHEDULED,
    },
  ],
  supervisorAssignments: [
    { supervisor: { user: { displayName: "Primary Supervisor" } } },
  ],
  theses: [],
  programmeCompletion: null,
  graduationRecord: null,
};

describe("Department progress tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.student.findMany).mockResolvedValue([studentRow] as never);
    vi.mocked(prisma.student.count).mockResolvedValue(1);
    vi.mocked(prisma.lifecycleAuditEvent.create).mockResolvedValue({
      id: "audit-1",
    } as never);
  });

  it("derives fixed milestone cells and supervisor scope from records", async () => {
    const supervisorAuth = {
      ...adminAuth,
      userId: "supervisor-user",
      role: UserRole.SUPERVISOR,
    };
    const result = await listDepartmentProgressTable(
      {
        programType: ProgramType.MPHIL,
        studyMode: StudyMode.FULL_TIME,
      },
      supervisorAuth,
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(result.rows[0]).toMatchObject({
      milestones: { M1: "COMPLETED", M2: "DUE" },
      primarySupervisor: "Primary Supervisor",
      overdueCount: 0,
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supervisorAssignments: {
            some: {
              supervisorUserId: "supervisor-user",
              effectiveTo: null,
            },
          },
        }),
      }),
    );
  });

  it("exports every filtered row with stable columns and formula neutralization", async () => {
    const result = await exportDepartmentProgressTable(
      {
        programType: ProgramType.MPHIL,
        studyMode: StudyMode.FULL_TIME,
        page: 9,
        limit: 1,
      },
      adminAuth,
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(result.rowCount).toBe(1);
    expect(result.csv).toContain("student_id,student_name,programme,study_mode");
    expect(result.csv).toContain("'=Formula Student");
    expect(result.csv).toContain(",M1,M2,M3,M4,");
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ skip: expect.anything(), take: expect.anything() }),
    );
    expect(prisma.lifecycleAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "progress.table_exported",
          metadata: expect.objectContaining({ rowCount: 1 }),
        }),
      }),
    );
  });
});
