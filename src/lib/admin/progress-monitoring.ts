import { AcademicStatus, ProgramType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";
import { ADMIN_REPORT_PAGE_SIZE } from "@/lib/admin/system-reports";

const overdueProgressFilterSchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    programType: z.nativeEnum(ProgramType).optional(),
    supervisorId: z.string().min(1).optional(),
    format: z.enum(["json", "csv"]).optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      return new Date(value.from) <= new Date(value.to);
    },
    {
      message: "The 'from' date must be earlier than or equal to the 'to' date.",
      path: ["from"],
    },
  );

export type OverdueProgressFilters = z.infer<typeof overdueProgressFilterSchema>;

export type OverdueProgressReportRow = {
  reportId: string;
  studentId: string;
  studentName: string;
  programType: ProgramType;
  periodLabel: string;
  daysOverdue: number;
  supervisorId: string | null;
  supervisorName: string;
  updatedAt: Date;
};

export type OverdueProgressStudentGroup = {
  studentId: string;
  studentName: string;
  programType: ProgramType;
  supervisorId: string | null;
  supervisorName: string;
  reports: Array<{
    reportId: string;
    periodLabel: string;
    daysOverdue: number;
    updatedAt: Date;
  }>;
};

export class AdminProgressMonitoringError extends Error {
  status: 400 | 404 | 500;

  constructor(message: string, status: 400 | 404 | 500 = 400) {
    super(message);
    this.name = "AdminProgressMonitoringError";
    this.status = status;
  }
}

export function parseOverdueProgressFilters(input: unknown): OverdueProgressFilters {
  const parsed = overdueProgressFilterSchema.safeParse(input);

  if (!parsed.success) {
    throw new AdminProgressMonitoringError(
      parsed.error.issues[0]?.message ?? "Invalid overdue report filters.",
      400,
    );
  }

  return parsed.data;
}

function calculateDaysOverdue(referenceDate: Date, updatedAt: Date) {
  const elapsedMs = referenceDate.getTime() - updatedAt.getTime();
  return Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
}

function buildOverdueProgressWhere(filters: OverdueProgressFilters) {
  return {
    isOverdue: true,
    isArchived: false,
    ...(filters.from || filters.to
      ? {
          updatedAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
    student: {
      ...(filters.programType ? { programType: filters.programType } : {}),
      ...(filters.supervisorId
        ? {
            supervisorAssignments: {
              some: {
                supervisorId: filters.supervisorId,
                isPrimary: true,
              },
            },
          }
        : {}),
    },
  };
}

export async function getOverdueProgressReportRows(
  filters: OverdueProgressFilters,
  referenceDate = new Date(),
): Promise<OverdueProgressReportRow[]> {
  const reports = await prisma.progressReport.findMany({
    where: buildOverdueProgressWhere(filters),
    orderBy: [
      {
        student: {
          user: {
            displayName: "asc",
          },
        },
      },
      {
        updatedAt: "desc",
      },
    ],
    select: {
      id: true,
      periodLabel: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          programType: true,
          user: {
            select: {
              displayName: true,
            },
          },
          supervisorAssignments: {
            where: {
              isPrimary: true,
            },
            take: 1,
            select: {
              supervisorId: true,
              supervisor: {
                select: {
                  user: {
                    select: {
                      displayName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return reports.map((report) => {
    const primarySupervisor = report.student.supervisorAssignments[0] ?? null;

    return {
      reportId: report.id,
      studentId: report.student.id,
      studentName: report.student.user.displayName,
      programType: report.student.programType,
      periodLabel: report.periodLabel,
      daysOverdue: calculateDaysOverdue(referenceDate, report.updatedAt),
      supervisorId: primarySupervisor?.supervisorId ?? null,
      supervisorName:
        primarySupervisor?.supervisor.user.displayName ?? "Unassigned",
      updatedAt: report.updatedAt,
    };
  });
}

export function groupOverdueProgressReports(
  rows: OverdueProgressReportRow[],
): OverdueProgressStudentGroup[] {
  const groups = new Map<string, OverdueProgressStudentGroup>();

  for (const row of rows) {
    const existing = groups.get(row.studentId);

    if (!existing) {
      groups.set(row.studentId, {
        studentId: row.studentId,
        studentName: row.studentName,
        programType: row.programType,
        supervisorId: row.supervisorId,
        supervisorName: row.supervisorName,
        reports: [
          {
            reportId: row.reportId,
            periodLabel: row.periodLabel,
            daysOverdue: row.daysOverdue,
            updatedAt: row.updatedAt,
          },
        ],
      });
      continue;
    }

    existing.reports.push({
      reportId: row.reportId,
      periodLabel: row.periodLabel,
      daysOverdue: row.daysOverdue,
      updatedAt: row.updatedAt,
    });
  }

  return [...groups.values()];
}

function escapeCsvField(value: string | number) {
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;

  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

export function buildOverdueProgressCsv(rows: OverdueProgressReportRow[]) {
  const header = [
    "Student Name",
    "Period",
    "Days Overdue",
    "Supervisor Name",
  ];
  const body = rows.map((row) =>
    [
      row.studentName,
      row.periodLabel,
      row.daysOverdue,
      row.supervisorName,
    ]
      .map(escapeCsvField)
      .join(","),
  );

  return [header.join(","), ...body].join("\n");
}

export async function listOverdueProgressReports(
  filters: OverdueProgressFilters,
  referenceDate = new Date(),
) {
  const rows = await getOverdueProgressReportRows(filters, referenceDate);
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit =
    filters.limit && filters.limit > 0
      ? Math.min(filters.limit, ADMIN_REPORT_PAGE_SIZE)
      : ADMIN_REPORT_PAGE_SIZE;
  const startIndex = (page - 1) * limit;
  const pagedRows = rows.slice(startIndex, startIndex + limit);

  return {
    totalOverdueReports: rows.length,
    students: groupOverdueProgressReports(pagedRows),
    pagination: {
      page,
      limit,
      total: rows.length,
      pageCount: Math.ceil(rows.length / limit),
    },
  };
}

export async function listStudentsUnderReview() {
  const students = await prisma.student.findMany({
    where: {
      academicStatus: AcademicStatus.UNDER_REVIEW,
      isArchived: false,
    },
    orderBy: {
      user: {
        displayName: "asc",
      },
    },
    select: {
      id: true,
      programType: true,
      academicStatus: true,
      enrollmentDate: true,
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
      supervisorAssignments: {
        where: {
          isPrimary: true,
        },
        take: 1,
        select: {
          supervisorId: true,
          supervisor: {
            select: {
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return students.map((student) => ({
    id: student.id,
    studentName: student.user.displayName,
    email: student.user.email,
    programType: student.programType,
    academicStatus: student.academicStatus,
    enrollmentDate: student.enrollmentDate,
    primarySupervisorId: student.supervisorAssignments[0]?.supervisorId ?? null,
    primarySupervisorName:
      student.supervisorAssignments[0]?.supervisor.user.displayName ?? "Unassigned",
  }));
}
