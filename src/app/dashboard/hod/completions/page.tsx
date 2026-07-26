import { CorrectionOrderStatus } from "@prisma/client";

import { HodCompletionDecisionPanel } from "@/components/hod/department-decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function HodCompletionsPage() {
  await getServerDashboardContext("hod");
  const [corrections, students] = await Promise.all([
    prisma.correctionOrder.findMany({
      where: {
        status: {
          in: [
            CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
            CorrectionOrderStatus.EXAMINER_APPROVED,
          ],
        },
      },
      select: {
        id: true,
        requirementType: true,
        requiresExaminerReview: true,
        status: true,
        requirements: true,
        thesis: { select: { student: { select: { user: { select: { displayName: true } } } } } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.student.findMany({
      where: {
        programmeCompletion: null,
        theses: {
          some: {
            viva: { is: { hodOutcome: { not: null } } },
          },
        },
      },
      select: {
        id: true,
        user: { select: { displayName: true } },
        theses: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { title: true },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div><h1 className="text-3xl font-bold tracking-tight">Completion decisions</h1><p className="mt-2 text-muted-foreground">Close submitted corrections and approve academic completion.</p></div>
      <HodCompletionDecisionPanel
        corrections={corrections.map((order) => ({
          id: order.id,
          studentName: order.thesis.student.user.displayName,
          requirementType: order.requirementType,
          requiresExaminerReview: order.requiresExaminerReview,
          status: order.status,
          requirements: order.requirements,
          submissionCount: order._count.submissions,
        }))}
        students={students.map((student) => ({ id: student.id, studentName: student.user.displayName, thesisTitle: student.theses[0]?.title ?? "Thesis" }))}
      />
    </div>
  );
}
