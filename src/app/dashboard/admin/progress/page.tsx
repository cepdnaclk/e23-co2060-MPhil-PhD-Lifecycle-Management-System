import { DepartmentProgressTables } from "@/components/progress/department-progress-tables";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import {
  listDepartmentProgressTable,
  PROGRESS_TABLES,
} from "@/lib/progress/department-tables";

export default async function AdminProgressPage() {
  const { auth } = await getServerDashboardContext("admin");
  const tables = await Promise.all(
    PROGRESS_TABLES.map(async (table) => ({
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
    })),
  );
  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Department progress</h1>
        <p className="mt-2 text-muted-foreground">
          Four fixed tables derived from milestone records.
        </p>
      </div>
      <DepartmentProgressTables tables={tables} />
    </div>
  );
}
