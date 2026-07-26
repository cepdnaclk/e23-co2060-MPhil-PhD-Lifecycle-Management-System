import { AcademicStatus, ProgramType, ThesisStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    thesis: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import {
  buildGraduationsCsv,
  buildStudentReportCsv,
  buildThesisPipelineCsv,
  listGraduationsReport,
  listStudentReport,
  listThesisPipelineReport,
  parseAdminReportFilters,
} from "@/lib/admin/system-reports";
import { prisma } from "@/lib/prisma/client";

describe("admin system reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters student reports by program type and academic status", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.student.count).mockResolvedValue(0 as never);

    const filters = parseAdminReportFilters({
      programType: ProgramType.MPHIL,
      status: AcademicStatus.ACTIVE,
    });

    await listStudentReport(filters);

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          programType: ProgramType.MPHIL,
          academicStatus: AcademicStatus.ACTIVE,
        }),
      }),
    );
  });

  it("does not paginate a filtered CSV export", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.student.count).mockResolvedValue(125 as never);

    await listStudentReport(
      parseAdminReportFilters({
        format: "csv",
        programType: ProgramType.PHD,
        page: 2,
        limit: 10,
      }),
    );

    const query = vi.mocked(prisma.student.findMany).mock.calls[0]?.[0];
    expect(query).not.toHaveProperty("skip");
    expect(query).not.toHaveProperty("take");
    expect(query?.where).toMatchObject({ programType: ProgramType.PHD });
  });

  it("filters thesis pipeline by thesis status", async () => {
    vi.mocked(prisma.thesis.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.thesis.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.thesis.groupBy).mockResolvedValue([] as never);

    const filters = parseAdminReportFilters({
      status: ThesisStatus.UNDER_EXAMINATION,
    });

    await listThesisPipelineReport(filters);

    expect(prisma.thesis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ThesisStatus.UNDER_EXAMINATION,
        }),
      }),
    );
  });

  it("returns only graduated students in the graduations report", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.student.count).mockResolvedValue(0 as never);

    await listGraduationsReport(parseAdminReportFilters({}));

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicStatus: AcademicStatus.GRADUATED,
        }),
      }),
    );
  });

  it("builds student report csv with visible headers", () => {
    const csv = buildStudentReportCsv([
      {
        studentId: "student-1",
        studentName: "Student One",
        email: "student1@example.com",
        programType: ProgramType.PHD,
        academicStatus: AcademicStatus.ACTIVE,
        enrollmentDate: new Date("2024-01-15T00:00:00.000Z"),
        primarySupervisorId: "supervisor-1",
        primarySupervisorName: "Dr. Primary",
        currentThesisStatus: ThesisStatus.SUBMITTED,
      },
    ]);

    expect(csv).toContain("Student ID,Student Name,Email,Program Type,Academic Status");
    expect(csv).toContain("student-1,Student One,student1@example.com,PHD,ACTIVE");
  });

  it("neutralizes spreadsheet formulas in CSV text fields", () => {
    const csv = buildStudentReportCsv([
      {
        studentId: "student-formula",
        studentName: "=HYPERLINK(\"https://example.invalid\")",
        email: "formula@example.com",
        programType: ProgramType.PHD,
        academicStatus: AcademicStatus.ACTIVE,
        enrollmentDate: new Date("2024-01-15T00:00:00.000Z"),
        primarySupervisorId: null,
        primarySupervisorName: "Unassigned",
        currentThesisStatus: null,
      },
    ]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(",=HYPERLINK");
  });

  it("builds thesis pipeline csv with status columns", () => {
    const csv = buildThesisPipelineCsv([
      {
        thesisId: "thesis-1",
        title: "Adaptive Systems",
        status: ThesisStatus.UNDER_EXAMINATION,
        studentId: "student-1",
        studentName: "Student One",
        email: "student1@example.com",
        programType: ProgramType.MPHIL,
        primarySupervisorId: "supervisor-1",
        primarySupervisorName: "Dr. Primary",
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);

    expect(csv).toContain("Thesis ID,Title,Status,Student ID");
    expect(csv).toContain("thesis-1,Adaptive Systems,UNDER_EXAMINATION");
  });

  it("builds graduations csv with archive details", () => {
    const csv = buildGraduationsCsv([
      {
        studentId: "student-9",
        studentName: "Graduate One",
        email: "grad@example.com",
        programType: ProgramType.PHD,
        academicStatus: AcademicStatus.GRADUATED,
        enrollmentDate: new Date("2020-01-01T00:00:00.000Z"),
        archivedThesisTitle: "Final Thesis",
        recordUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);

    expect(csv).toContain("Archived Thesis Title");
    expect(csv).toContain("student-9,Graduate One,grad@example.com,PHD,GRADUATED");
  });
});
