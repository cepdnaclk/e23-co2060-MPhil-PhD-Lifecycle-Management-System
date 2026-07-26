import { ProgramType, StudyMode } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROGRESS_TABLES } from "@/lib/progress/department-tables";

type TableRow = {
  studentId: string;
  studentName: string;
  enrollmentDate: Date;
  expectedCompletionDate: Date | null;
  primarySupervisor: string;
  milestones: Record<string, string>;
  nextDueDate: Date | null;
  overdueCount: number;
  currentLifecycleStage: string;
};

export function DepartmentProgressTables({
  tables,
}: {
  tables: Array<{
    programType: ProgramType;
    studyMode: StudyMode;
    rows: TableRow[];
  }>;
}) {
  return (
    <div className="space-y-6">
      {tables.map((table) => {
        const definition = PROGRESS_TABLES.find(
          (item) =>
            item.programType === table.programType &&
            item.studyMode === table.studyMode,
        );
        const milestones = Array.from(
          { length: definition?.milestoneCount ?? 0 },
          (_, index) => `M${index + 1}`,
        );
        const exportHref = `/api/progress-tables?programType=${table.programType}&studyMode=${table.studyMode}&format=csv`;
        return (
          <Card key={`${table.programType}-${table.studyMode}`}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>
                  {table.programType === ProgramType.MPHIL ? "M.Phil." : "Ph.D."}{" "}
                  {table.studyMode === StudyMode.FULL_TIME ? "Full-time" : "Part-time"}
                </CardTitle>
                <CardDescription>
                  Fixed {milestones.length}-milestone Department schedule
                </CardDescription>
              </div>
              <Button asChild variant="outline">
                <a href={exportHref}>Export all filtered rows</a>
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="sticky left-0 bg-background p-2">Student</th>
                    <th className="p-2">Enrolment</th>
                    <th className="p-2">Expected completion</th>
                    <th className="p-2">Primary Supervisor</th>
                    {milestones.map((milestone) => (
                      <th className="p-2 text-center" key={milestone}>{milestone}</th>
                    ))}
                    <th className="p-2">Next due</th>
                    <th className="p-2">Overdue</th>
                    <th className="p-2">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 ? (
                    <tr><td className="p-4 text-muted-foreground" colSpan={8 + milestones.length}>No students in this table.</td></tr>
                  ) : table.rows.map((row) => (
                    <tr className="border-b" key={row.studentId}>
                      <td className="sticky left-0 bg-background p-2 font-medium">
                        {row.studentName}<span className="block text-xs text-muted-foreground">{row.studentId}</span>
                      </td>
                      <td className="p-2">{new Date(row.enrollmentDate).toLocaleDateString()}</td>
                      <td className="p-2">{row.expectedCompletionDate ? new Date(row.expectedCompletionDate).toLocaleDateString() : "—"}</td>
                      <td className="p-2">{row.primarySupervisor}</td>
                      {milestones.map((milestone) => {
                        const complete = row.milestones[milestone] === "COMPLETED";
                        return (
                          <td className="p-2 text-center" key={milestone}>
                            <span aria-label={`${milestone}: ${complete ? "completed" : "not completed"}`}>
                              {complete ? "✓" : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="p-2">{row.nextDueDate ? new Date(row.nextDueDate).toLocaleDateString() : "—"}</td>
                      <td className="p-2"><Badge variant={row.overdueCount ? "destructive" : "secondary"}>{row.overdueCount}</Badge></td>
                      <td className="p-2">{row.currentLifecycleStage.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
