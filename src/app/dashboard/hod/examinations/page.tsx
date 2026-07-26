import { AssignmentStatus } from "@prisma/client";

import { HodExaminationDecisionPanel } from "@/components/hod/department-decision-panels";
import { HodReadinessPanel } from "@/components/thesis-readiness/decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function HodExaminationsPage() {
  await getServerDashboardContext("hod");
  const [readinessRequests, assignments, vivas] = await Promise.all([
    prisma.thesisReadinessCertification.findMany({
      where: { decision: "CERTIFIED" },
      orderBy: { certifiedAt: "asc" },
      select: {
        id: true,
        supervisorNotes: true,
        student: { select: { user: { select: { displayName: true } } } },
        certifiedBy: { select: { displayName: true } },
      },
    }),
    prisma.thesisExaminerAssignment.findMany({
      where: { status: AssignmentStatus.PENDING },
      orderBy: { assignedAt: "asc" },
      select: {
        id: true,
        thesis: { select: { title: true } },
        examiner: { select: { user: { select: { displayName: true } } } },
      },
    }),
    prisma.viva.findMany({
      where: {
        hodOutcome: null,
        recommendations: { some: {} },
      },
      orderBy: { scheduledDate: "asc" },
      select: {
        id: true,
        thesis: { select: { title: true } },
        _count: { select: { recommendations: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div><h1 className="text-3xl font-bold tracking-tight">Examination decisions</h1><p className="mt-2 text-muted-foreground">Confirm exact assignments and record the final HOD viva outcome.</p></div>
      <HodReadinessPanel
        requests={readinessRequests.map((request) => ({
          id: request.id,
          studentName: request.student.user.displayName,
          supervisorName: request.certifiedBy?.displayName ?? "Primary Supervisor",
          supervisorNotes: request.supervisorNotes,
        }))}
      />
      <HodExaminationDecisionPanel
        assignments={assignments.map((assignment) => ({ id: assignment.id, thesisTitle: assignment.thesis.title, examinerName: assignment.examiner.user.displayName }))}
        vivas={vivas.map((viva) => ({ id: viva.id, thesisTitle: viva.thesis.title, recommendationCount: viva._count.recommendations }))}
      />
    </div>
  );
}
