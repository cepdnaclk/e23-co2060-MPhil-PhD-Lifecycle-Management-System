import {
  MilestoneStatus,
  Prisma,
  ProgramType,
  StudyMode,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

import { appendLifecycleEvent, LIFECYCLE_EVENT } from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export const PROGRESS_TABLES = [
  { programType: ProgramType.MPHIL, studyMode: StudyMode.FULL_TIME, milestoneCount: 4 },
  { programType: ProgramType.MPHIL, studyMode: StudyMode.PART_TIME, milestoneCount: 6 },
  { programType: ProgramType.PHD, studyMode: StudyMode.FULL_TIME, milestoneCount: 6 },
  { programType: ProgramType.PHD, studyMode: StudyMode.PART_TIME, milestoneCount: 9 },
] as const;

export const progressTableFilterSchema = z.object({
  programType: z.nativeEnum(ProgramType),
  studyMode: z.nativeEnum(StudyMode),
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ProgressTableFilters = z.infer<typeof progressTableFilterSchema>;

export class DepartmentProgressTableError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentProgressTableError";
    this.status = status;
  }
}

function assertProgressTableRole(auth: AuthenticatedUserContext) {
  if (
    auth.role !== UserRole.ADMINISTRATOR &&
    auth.role !== UserRole.HOD &&
    auth.role !== UserRole.SUPERVISOR
  ) {
    throw new DepartmentProgressTableError(
      "Department progress tables are restricted to authorized staff.",
      403,
    );
  }
}

function buildWhere(
  filters: ProgressTableFilters,
  auth: AuthenticatedUserContext,
): Prisma.StudentWhereInput {
  return {
    programType: filters.programType,
    studyMode: filters.studyMode,
    isArchived: false,
    ...(filters.query
      ? {
          OR: [
            { id: { contains: filters.query, mode: Prisma.QueryMode.insensitive } },
            {
              user: {
                displayName: {
                  contains: filters.query,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          ],
        }
      : {}),
    ...(auth.role === UserRole.SUPERVISOR
      ? {
          supervisorAssignments: {
            some: {
              supervisorUserId: auth.userId,
              effectiveTo: null,
            },
          },
        }
      : {}),
  };
}

const completedStatuses = new Set<MilestoneStatus>([
  MilestoneStatus.APPROVED,
  MilestoneStatus.WAIVED,
]);

function lifecycleStage(student: {
  graduationRecord: { status: string } | null;
  programmeCompletion: { status: string } | null;
  theses: Array<{ status: string }>;
  milestones: Array<{ status: MilestoneStatus }>;
}) {
  if (student.graduationRecord?.status === "RECORDED") return "GRADUATED";
  if (student.programmeCompletion?.status === "RECORDED") return "COMPLETED";
  if (student.theses.length > 0) return "THESIS_EXAMINATION";
  if (student.milestones.some((milestone) => completedStatuses.has(milestone.status))) {
    return "PROGRESS";
  }
  return "ADMITTED";
}

async function queryRows(
  filters: ProgressTableFilters,
  auth: AuthenticatedUserContext,
  paginate: boolean,
  referenceDate: Date,
) {
  assertProgressTableRole(auth);
  const where = buildWhere(filters, auth);
  const students = await prisma.student.findMany({
    where,
    orderBy: [{ enrollmentDate: "asc" }, { id: "asc" }],
    ...(paginate
      ? { skip: (filters.page - 1) * filters.limit, take: filters.limit }
      : {}),
    select: {
      id: true,
      programType: true,
      studyMode: true,
      academicStatus: true,
      enrollmentDate: true,
      expectedCompletionDate: true,
      user: { select: { displayName: true } },
      milestones: {
        orderBy: { sequenceNumber: "asc" },
        select: {
          sequenceNumber: true,
          dueDate: true,
          status: true,
        },
      },
      supervisorAssignments: {
        where: { isPrimary: true, effectiveTo: null },
        take: 1,
        select: {
          supervisor: { select: { user: { select: { displayName: true } } } },
        },
      },
      theses: {
        where: { isArchived: false },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { status: true },
      },
      programmeCompletion: { select: { status: true } },
      graduationRecord: { select: { status: true } },
    },
  });

  return students.map((student) => {
    const openMilestones = student.milestones.filter(
      (milestone) => !completedStatuses.has(milestone.status),
    );
    return {
      studentId: student.id,
      studentName: student.user.displayName,
      programme: student.programType,
      studyMode: student.studyMode,
      enrollmentDate: student.enrollmentDate,
      expectedCompletionDate: student.expectedCompletionDate,
      primarySupervisor:
        student.supervisorAssignments[0]?.supervisor.user.displayName ?? "Unassigned",
      milestones: Object.fromEntries(
        student.milestones.map((milestone) => [
          `M${milestone.sequenceNumber}`,
          completedStatuses.has(milestone.status) ? "COMPLETED" : "DUE",
        ]),
      ),
      nextDueDate: openMilestones[0]?.dueDate ?? null,
      overdueCount: openMilestones.filter(
        (milestone) => milestone.dueDate < referenceDate,
      ).length,
      currentLifecycleStage: lifecycleStage(student),
      academicStatus: student.academicStatus,
      profileUrl: `/dashboard/students/${student.id}`,
    };
  });
}

export async function listDepartmentProgressTable(
  input: unknown,
  auth: AuthenticatedUserContext,
  referenceDate = new Date(),
) {
  const parsed = progressTableFilterSchema.safeParse(input);
  if (!parsed.success) {
    throw new DepartmentProgressTableError(
      parsed.error.issues[0]?.message ?? "Invalid progress table filters.",
    );
  }
  const where = buildWhere(parsed.data, auth);
  const [rows, total] = await Promise.all([
    queryRows(parsed.data, auth, true, referenceDate),
    prisma.student.count({ where }),
  ]);
  return {
    filters: parsed.data,
    rows,
    pagination: {
      page: parsed.data.page,
      limit: parsed.data.limit,
      total,
      pageCount: Math.ceil(total / parsed.data.limit),
    },
  };
}

function csvCell(value: unknown) {
  const raw =
    value instanceof Date
      ? value.toISOString()
      : value === null || value === undefined
        ? ""
        : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll("\"", "\"\"")}"` : safe;
}

export async function exportDepartmentProgressTable(
  input: unknown,
  auth: AuthenticatedUserContext,
  referenceDate = new Date(),
) {
  const parsed = progressTableFilterSchema.safeParse(input);
  if (!parsed.success) {
    throw new DepartmentProgressTableError(
      parsed.error.issues[0]?.message ?? "Invalid progress table filters.",
    );
  }
  const definition = PROGRESS_TABLES.find(
    (table) =>
      table.programType === parsed.data.programType &&
      table.studyMode === parsed.data.studyMode,
  );
  if (!definition) {
    throw new DepartmentProgressTableError("Unsupported progress table.");
  }
  const rows = await queryRows(parsed.data, auth, false, referenceDate);
  const milestoneHeaders = Array.from(
    { length: definition.milestoneCount },
    (_, index) => `M${index + 1}`,
  );
  const header = [
    "student_id",
    "student_name",
    "programme",
    "study_mode",
    "enrollment_date",
    "expected_completion_date",
    "primary_supervisor",
    ...milestoneHeaders,
    "next_due_date",
    "overdue_count",
    "current_lifecycle_stage",
    "academic_status",
  ];
  const body = rows.map((row) =>
    [
      row.studentId,
      row.studentName,
      row.programme,
      row.studyMode,
      row.enrollmentDate,
      row.expectedCompletionDate,
      row.primarySupervisor,
      ...milestoneHeaders.map((milestone) => row.milestones[milestone] ?? "DUE"),
      row.nextDueDate,
      row.overdueCount,
      row.currentLifecycleStage,
      row.academicStatus,
    ]
      .map(csvCell)
      .join(","),
  );

  await appendLifecycleEvent(prisma as never, {
    eventKey: `progress-export:${auth.userId}:${referenceDate.toISOString()}:${parsed.data.programType}:${parsed.data.studyMode}`,
    eventType: LIFECYCLE_EVENT.PROGRESS_TABLE_EXPORTED,
    aggregateType: "DepartmentProgressTable",
    aggregateId: `${parsed.data.programType}:${parsed.data.studyMode}`,
    actorUserId: auth.userId,
    actorRole: auth.role,
    newState: "EXPORTED",
    metadata: {
      rowCount: rows.length,
      query: parsed.data.query ?? null,
      generatedAt: referenceDate.toISOString(),
    },
  });

  return {
    csv: `\uFEFF${[header.join(","), ...body].join("\r\n")}`,
    rowCount: rows.length,
    generatedAt: referenceDate,
  };
}
