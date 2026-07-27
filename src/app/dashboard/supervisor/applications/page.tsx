import { AssignmentStatus, SupervisorConsentStatus } from "@prisma/client";

import {
  AssignedProposalReviewPanel,
  ProposedSupervisorConsentPanel,
} from "@/components/applications/assigned-proposal-work";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function SupervisorApplicationsPage() {
  const { auth } = await getServerDashboardContext("supervisor");
  const [applications, assignments] = await Promise.all([
    prisma.application.findMany({
      where: {
        proposedSupervisorUserId: auth.userId,
        supervisorConsentStatus: SupervisorConsentStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        applicantName: true,
        proposalTitle: true,
        proposalAbstract: true,
      },
    }),
    prisma.proposalReviewerAssignment.findMany({
      where: { reviewerUserId: auth.userId, status: AssignmentStatus.PENDING },
      orderBy: { assignedAt: "asc" },
      select: {
        id: true,
        application: { select: { applicantName: true } },
        proposalVersion: {
          select: { title: true, abstract: true, versionNumber: true },
        },
      },
    }),
  ]);
  return (
    <div className="space-y-8 p-4 pt-6 md:p-8">
      <section className="space-y-4"><div><h2 className="text-3xl font-bold tracking-tight">Application work</h2><p className="mt-2 text-muted-foreground">Proposed-supervisor consent and explicitly assigned proposal reviews.</p></div><h3 className="text-xl font-semibold">Consent requests</h3><ProposedSupervisorConsentPanel applications={applications} /></section>
      <section className="space-y-4"><h2 className="text-xl font-semibold">Assigned reviews</h2><AssignedProposalReviewPanel assignments={assignments.map((assignment) => ({ id: assignment.id, applicantName: assignment.application.applicantName, ...assignment.proposalVersion }))} /></section>
    </div>
  );
}
