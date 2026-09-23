import { ProposalStatus } from "@prisma/client";

import { ProposalApprovalPanel } from "@/components/admin/proposal-approval-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function AdminProposalApprovalsPage() {
  await getServerDashboardContext("admin");

  const proposals = await prisma.researchProposal.findMany({
    where: {
      isArchived: false,
      status: {
        in: [
          ProposalStatus.SUBMITTED,
          ProposalStatus.UNDER_REVIEW,
          ProposalStatus.APPROVED,
        ],
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
      student: {
        select: {
          user: { select: { displayName: true, email: true } },
        },
      },
      evaluations: {
        orderBy: { submissionDate: "desc" },
        select: {
          id: true,
          feedback: true,
          submissionDate: true,
          examiner: {
            select: {
              user: { select: { displayName: true, email: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Proposal Approvals</h2>
        <p className="mt-2 text-muted-foreground">
          Review examiner feedback and approve research proposals.
        </p>
      </div>
      <ProposalApprovalPanel proposals={proposals} />
    </div>
  );
}
