import { ProposalStatus } from "@prisma/client";

import { SupervisorProposalEvaluationPanel } from "@/components/supervisor/supervisor-proposal-evaluation-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function SupervisorProposalEvaluationsPage() {
  const { auth } = await getServerDashboardContext("supervisor");

  const supervisorProfile = await prisma.supervisor.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  const proposals = supervisorProfile
    ? await prisma.researchProposal.findMany({
        where: {
          isArchived: false,
          status: {
            in: [ProposalStatus.SUBMITTED, ProposalStatus.UNDER_REVIEW, ProposalStatus.APPROVED],
          },
          student: {
            supervisorAssignments: {
              some: {
                supervisorId: supervisorProfile.id,
                effectiveTo: null,
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          abstract: true,
          status: true,
          currentVersion: true,
          updatedAt: true,
          evaluations: {
            select: {
              id: true,
              feedback: true,
              submissionDate: true,
              examiner: {
                select: {
                  userId: true,
                },
              },
            },
          },
          student: {
            select: {
              user: { select: { displayName: true, email: true } },
            },
          },
        },
      })
    : [];

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Proposal Evaluations</h2>
        <p className="mt-2 text-muted-foreground">
          Review and evaluate research proposals submitted by your assigned students.
        </p>
      </div>
      <SupervisorProposalEvaluationPanel
        proposals={proposals}
        supervisorUserId={auth.userId}
      />
    </div>
  );
}
