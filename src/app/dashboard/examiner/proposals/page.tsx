import { AssignmentStatus } from "@prisma/client";

import { AssignedProposalReviewPanel } from "@/components/applications/assigned-proposal-work";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function ExaminerProposalsPage() {
  const { auth } = await getServerDashboardContext("examiner");
  const assignments = await prisma.proposalReviewerAssignment.findMany({
    where: { reviewerUserId: auth.userId, status: AssignmentStatus.PENDING },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      application: { select: { applicantName: true } },
      proposalVersion: {
        select: { title: true, abstract: true, versionNumber: true },
      },
    },
  });
  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div><h1 className="text-3xl font-bold tracking-tight">Assigned proposals</h1><p className="mt-2 text-muted-foreground">Review only the exact proposal version assigned to you.</p></div>
      <AssignedProposalReviewPanel assignments={assignments.map((assignment) => ({ id: assignment.id, applicantName: assignment.application.applicantName, ...assignment.proposalVersion }))} />
    </div>
  );
}
