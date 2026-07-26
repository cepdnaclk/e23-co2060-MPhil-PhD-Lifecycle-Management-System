import { DepartmentProgressTables } from "@/components/progress/department-progress-tables";
import { SupervisorReadinessPanel } from "@/components/thesis-readiness/decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import {
  listDepartmentProgressTable,
  PROGRESS_TABLES,
} from "@/lib/progress/department-tables";
import { prisma } from "@/lib/prisma/client";

export default async function SupervisorProgressPage() {
  const { auth } = await getServerDashboardContext("supervisor");
  const [tables, readinessRequests] = await Promise.all([
    Promise.all(PROGRESS_TABLES.map(async (table) => ({
      ...table,
      rows: (
        await listDepartmentProgressTable(
          {
            programType: table.programType,
            studyMode: table.studyMode,
            page: 1,
            limit: 25,
          },
          auth,
        )
      ).rows,
    }))),
    prisma.thesisReadinessCertification.findMany({
      where: {
        decision: "REQUESTED",
        student: {
          supervisorAssignments: {
            some: {
              isPrimary: true,
              effectiveTo: null,
              supervisorUserId: auth.userId,
            },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        studentMessage: true,
        student: { select: { user: { select: { displayName: true } } } },
      },
    }),
  ]);
  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assigned progress</h1>
        <p className="mt-2 text-muted-foreground">
          Milestones for your currently assigned students.
        </p>
      </div>
      <SupervisorReadinessPanel
        requests={readinessRequests.map((request) => ({
          id: request.id,
          studentName: request.student.user.displayName,
          studentMessage: request.studentMessage,
        }))}
      />
      <DepartmentProgressTables tables={tables} />
    </div>
  );
}
