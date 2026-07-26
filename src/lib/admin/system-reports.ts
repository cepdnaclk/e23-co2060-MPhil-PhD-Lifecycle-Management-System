import {
  AcademicStatus,
  ProgramType,
  ThesisStatus,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";

export const ADMIN_REPORT_PAGE_SIZE = 50;

const baseReportFilterSchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    programType: z.nativeEnum(ProgramType).optional(),
    status: z.string().min(1).optional(),
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

export type AdminReportFilters = z.infer<typeof baseReportFilterSchema>;

export class AdminSystemReportError extends Error {
  status: 400 | 500;

  constructor(message: string, status: 400 | 500 = 400) {
    super(message);
    this.name = "AdminSystemReportError";
    this.status = status;
  }
}

export type ReportPageMeta = {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type StudentReportRow = {
  studentId: string;
  studentName: string;
  email: string;
  programType: ProgramType;
  academicStatus: AcademicStatus;
  enrollmentDate: Date;
  primarySupervisorId: string | null;
  primarySupervisorName: string;
  currentThesisStatus: ThesisStatus | null;
};

export type ThesisPipelineRow = {
  thesisId: string;
  title: string;
  status: ThesisStatus;
  studentId: string;
  studentName: string;
  email: string;
  programType: ProgramType;
  primarySupervisorId: string | null;
  primarySupervisorName: string;
  updatedAt: Date;
};

export type GraduationReportRow = {
  studentId: string;
  studentName: string;
  email: string;
  programType: ProgramType;
  academicStatus: AcademicStatus;
  enrollmentDate: Date;
  archivedThesisTitle: string | null;
  recordUpdatedAt: Date;
};

export function parseAdminReportFilters(input: unknown): AdminReportFilters {
  const parsed = baseReportFilterSchema.safeParse(input);

  if (!parsed.success) {
    throw new AdminSystemReportError(
      parsed.error.issues[0]?.message ?? "Invalid admin report filters.",
      400,
    );
  }

  return parsed.data;
}

function normalizePagination(filters: AdminReportFilters) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit =
    filters.limit && filters.limit > 0
      ? Math.min(filters.limit, ADMIN_REPORT_PAGE_SIZE)
      : ADMIN_REPORT_PAGE_SIZE;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function buildPageMeta(total: number, page: number, limit: number): ReportPageMeta {
  return {
    page,
    limit,
    total,
    pageCount: Math.ceil(total / limit),
  };
}

function escapeCsvField(value: string | number) {
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;

  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function csvFromRows(headers: string[], rows: Array<Array<string | number>>) {
  return [headers.join(","), ...rows.map((row) => row.map(escapeCsvField).join(","))].join(
    "\n",
  );
}

function buildStudentWhere(filters: AdminReportFilters): Prisma.StudentWhereInput {
  const statusValues = Object.values(AcademicStatus) as string[];

  return {
    isArchived: false,
    ...(filters.programType ? { programType: filters.programType } : {}),
    ...(filters.status && statusValues.includes(filters.status)
      ? { academicStatus: filters.status as AcademicStatus }
      : {}),
    ...(filters.from || filters.to
      ? {
          enrollmentDate: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
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
  };
}

function buildThesisWhere(filters: AdminReportFilters): Prisma.ThesisWhereInput {
  const statusValues = Object.values(ThesisStatus) as string[];

  return {
    ...(filters.status && statusValues.includes(filters.status)
      ? { status: filters.status as ThesisStatus }
      : {}),
    ...(filters.from || filters.to
      ? {
          updatedAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
    student: {
      isArchived: false,
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

function mapStudentRow(student: Prisma.StudentGetPayload<{
  select: {
    id: true;
    programType: true;
    academicStatus: true;
    enrollmentDate: true;
    user: { select: { displayName: true; email: true } };
    supervisorAssignments: {
      where: { isPrimary: true };
      take: 1;
      select: {
        supervisorId: true;
        supervisor: { select: { user: { select: { displayName: true } } } };
      };
    };
    theses: {
      where: { isArchived: false };
      orderBy: { updatedAt: "desc" };
      take: 1;
      select: { status: true };
    };
  };
}>): StudentReportRow {
  const primary = student.supervisorAssignments[0] ?? null;

  return {
    studentId: student.id,
    studentName: student.user.displayName,
    email: student.user.email,
    programType: student.programType,
    academicStatus: student.academicStatus,
    enrollmentDate: student.enrollmentDate,
    primarySupervisorId: primary?.supervisorId ?? null,
    primarySupervisorName: primary?.supervisor.user.displayName ?? "Unassigned",
    currentThesisStatus: student.theses[0]?.status ?? null,
  };
}

function mapThesisPipelineRow(thesis: Prisma.ThesisGetPayload<{
  select: {
    id: true;
    title: true;
    status: true;
    updatedAt: true;
    student: {
      select: {
        id: true;
        programType: true;
        user: { select: { displayName: true; email: true } };
        supervisorAssignments: {
          where: { isPrimary: true };
          take: 1;
          select: {
            supervisorId: true;
            supervisor: { select: { user: { select: { displayName: true } } } };
          };
        };
      };
    };
  };
}>): ThesisPipelineRow {
  const primary = thesis.student.supervisorAssignments[0] ?? null;

  return {
    thesisId: thesis.id,
    title: thesis.title,
    status: thesis.status,
    studentId: thesis.student.id,
    studentName: thesis.student.user.displayName,
    email: thesis.student.user.email,
    programType: thesis.student.programType,
    primarySupervisorId: primary?.supervisorId ?? null,
    primarySupervisorName: primary?.supervisor.user.displayName ?? "Unassigned",
    updatedAt: thesis.updatedAt,
  };
}

function mapGraduationRow(student: Prisma.StudentGetPayload<{
  select: {
    id: true;
    programType: true;
    academicStatus: true;
    enrollmentDate: true;
    updatedAt: true;
    user: { select: { displayName: true; email: true } };
    theses: {
      where: { status: "ARCHIVED" };
      orderBy: { updatedAt: "desc" };
      take: 1;
      select: { title: true; updatedAt: true };
    };
  };
}>): GraduationReportRow {
  const archivedThesis = student.theses[0] ?? null;

  return {
    studentId: student.id,
    studentName: student.user.displayName,
    email: student.user.email,
    programType: student.programType,
    academicStatus: AcademicStatus.GRADUATED,
    enrollmentDate: student.enrollmentDate,
    archivedThesisTitle: archivedThesis?.title ?? null,
    recordUpdatedAt: archivedThesis?.updatedAt ?? student.updatedAt,
  };
}

export function buildStudentReportCsv(rows: StudentReportRow[]) {
  return csvFromRows(
    [
      "Student ID",
      "Student Name",
      "Email",
      "Program Type",
      "Academic Status",
      "Enrollment Date",
      "Primary Supervisor",
      "Current Thesis Status",
    ],
    rows.map((row) => [
      row.studentId,
      row.studentName,
      row.email,
      row.programType,
      row.academicStatus,
      row.enrollmentDate.toISOString(),
      row.primarySupervisorName,
      row.currentThesisStatus ?? "NONE",
    ]),
  );
}

export function buildThesisPipelineCsv(rows: ThesisPipelineRow[]) {
  return csvFromRows(
    [
      "Thesis ID",
      "Title",
      "Status",
      "Student ID",
      "Student Name",
      "Email",
      "Program Type",
      "Primary Supervisor",
      "Updated At",
    ],
    rows.map((row) => [
      row.thesisId,
      row.title,
      row.status,
      row.studentId,
      row.studentName,
      row.email,
      row.programType,
      row.primarySupervisorName,
      row.updatedAt.toISOString(),
    ]),
  );
}

export function buildGraduationsCsv(rows: GraduationReportRow[]) {
  return csvFromRows(
    [
      "Student ID",
      "Student Name",
      "Email",
      "Program Type",
      "Academic Status",
      "Enrollment Date",
      "Archived Thesis Title",
      "Record Updated At",
    ],
    rows.map((row) => [
      row.studentId,
      row.studentName,
      row.email,
      row.programType,
      row.academicStatus,
      row.enrollmentDate.toISOString(),
      row.archivedThesisTitle ?? "N/A",
      row.recordUpdatedAt.toISOString(),
    ]),
  );
}

export async function listStudentReport(filters: AdminReportFilters) {
  const { page, limit, skip } = normalizePagination(filters);
  const pagination = filters.format === "csv" ? {} : { skip, take: limit };
  const where = buildStudentWhere(filters);

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: {
        user: {
          displayName: "asc",
        },
      },
      ...pagination,
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
            effectiveTo: null,
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
        theses: {
          where: {
            isArchived: false,
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  const rows = students.map(mapStudentRow);

  return {
    rows,
    summary: {
      byProgramType: {
        MPHIL: rows.filter((row) => row.programType === ProgramType.MPHIL).length,
        PHD: rows.filter((row) => row.programType === ProgramType.PHD).length,
      },
      byStatus: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.academicStatus] = (acc[row.academicStatus] ?? 0) + 1;
        return acc;
      }, {}),
      bySupervisor: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.primarySupervisorName] = (acc[row.primarySupervisorName] ?? 0) + 1;
        return acc;
      }, {}),
    },
    pagination: buildPageMeta(total, page, limit),
  };
}

export async function listThesisPipelineReport(filters: AdminReportFilters) {
  const { page, limit, skip } = normalizePagination(filters);
  const pagination = filters.format === "csv" ? {} : { skip, take: limit };
  const where = buildThesisWhere(filters);

  const [theses, total, stageCountsRaw] = await Promise.all([
    prisma.thesis.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      ...pagination,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        student: {
          select: {
            id: true,
            programType: true,
            user: {
              select: {
                displayName: true,
                email: true,
              },
            },
            supervisorAssignments: {
              where: {
                isPrimary: true,
                effectiveTo: null,
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
    }),
    prisma.thesis.count({ where }),
    prisma.thesis.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
    }),
  ]);

  const rows = theses.map(mapThesisPipelineRow);
  const stageCounts = stageCountsRaw.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  return {
    rows,
    stageCounts,
    pagination: buildPageMeta(total, page, limit),
  };
}

export async function listGraduationsReport(filters: AdminReportFilters) {
  const { page, limit, skip } = normalizePagination(filters);
  const pagination = filters.format === "csv" ? {} : { skip, take: limit };
  const where: Prisma.StudentWhereInput = {
    ...buildStudentWhere(filters),
    academicStatus: AcademicStatus.GRADUATED,
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      ...pagination,
      select: {
        id: true,
        programType: true,
        academicStatus: true,
        enrollmentDate: true,
        updatedAt: true,
        user: {
          select: {
            displayName: true,
            email: true,
          },
        },
        theses: {
          where: {
            status: ThesisStatus.ARCHIVED,
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
          select: {
            title: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  const rows = students.map(mapGraduationRow);

  return {
    rows,
    pagination: buildPageMeta(total, page, limit),
  };
}
