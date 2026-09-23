import {
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowStage,
  MilestoneStatus,
  ProposalStatus,
  ReadinessDecision,
} from "@prisma/client";

import { SupervisorReadinessPanel } from "@/components/thesis-readiness/decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function SupervisorReadinessPage() {
  const { auth } = await getServerDashboardContext("supervisor");
  const requests = await prisma.thesisReadinessCertification.findMany({
    where: {
      decision: ReadinessDecision.REQUESTED,
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
      student: {
        select: {
          user: { select: { displayName: true, email: true } },
          researchProposals: {
            where: { status: ProposalStatus.APPROVED, isArchived: false },
            take: 1,
            select: { id: true },
          },
          milestones: { select: { status: true } },
          ethicsApprovals: {
            where: { isArchived: false },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              applicability: true,
              status: true,
              workflowStage: true,
              validUntil: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Thesis Readiness</h2>
        <p className="mt-2 text-muted-foreground">
          Verify academic and ethics prerequisites before forwarding a student to
          the HOD for examination approval.
        </p>
      </div>
      <SupervisorReadinessPanel
        requests={requests.map((request) => {
          const ethics = request.student.ethicsApprovals[0];
          const ethicsStatusSatisfied =
            ethics?.workflowStage === EthicsWorkflowStage.COMPLETED &&
            ((ethics.applicability === EthicsApplicability.REQUIRED &&
              ethics.status === EthicsRecordStatus.APPROVED &&
              (!ethics.validUntil || ethics.validUntil >= new Date())) ||
              (ethics.applicability === EthicsApplicability.NOT_REQUIRED &&
                ethics.status === EthicsRecordStatus.EXEMPT));

          return {
            id: request.id,
            studentName: request.student.user.displayName,
            studentEmail: request.student.user.email,
            studentMessage: request.studentMessage,
            criteria: {
              proposal: request.student.researchProposals.length === 1,
              milestones:
                request.student.milestones.length > 0 &&
                request.student.milestones.every(
                  (milestone) => milestone.status === MilestoneStatus.APPROVED,
                ),
              ethics: Boolean(ethicsStatusSatisfied),
              examinationCopy: true,
            },
          };
        })}
      />
    </div>
  );
}
