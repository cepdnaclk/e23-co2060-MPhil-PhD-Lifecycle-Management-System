import {
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowStage,
  MilestoneStatus,
  ProposalStatus,
} from "@prisma/client";

import { ThesisSubmissionPanel } from "@/components/student/thesis-submission-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function StudentThesisSubmitPage() {
  const { auth } = await getServerDashboardContext("student");

  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      readinessCertifications: {
        take: 1,
        select: {
          id: true,
          decision: true,
          studentMessage: true,
          supervisorNotes: true,
          hodNotes: true,
        },
      },
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
      theses: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          title: true,
          abstract: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          documents: {
            orderBy: { version: "desc" },
            select: {
              id: true,
              fileName: true,
              storagePath: true,
              version: true,
              isCurrentVersion: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const thesis = student?.theses[0] ?? null;
  const readiness = student?.readinessCertifications[0] ?? null;
  const ethics = student?.ethicsApprovals[0];
  const ethicsSatisfied = Boolean(
    ethics?.workflowStage === EthicsWorkflowStage.COMPLETED &&
      ((ethics.applicability === EthicsApplicability.REQUIRED &&
        ethics.status === EthicsRecordStatus.APPROVED &&
        (!ethics.validUntil || ethics.validUntil >= new Date())) ||
        (ethics.applicability === EthicsApplicability.NOT_REQUIRED &&
          ethics.status === EthicsRecordStatus.EXEMPT)),
  );

  return (
    <ThesisSubmissionPanel
      readiness={readiness}
      readinessCriteria={{
        proposalApproved: (student?.researchProposals.length ?? 0) === 1,
        ethicsSatisfied,
        milestonesApproved:
          (student?.milestones.length ?? 0) > 0 &&
          Boolean(
            student?.milestones.every(
              (milestone) => milestone.status === MilestoneStatus.APPROVED,
            ),
          ),
        approvedMilestones:
          student?.milestones.filter(
            (milestone) => milestone.status === MilestoneStatus.APPROVED,
          ).length ?? 0,
        totalMilestones: student?.milestones.length ?? 0,
      }}
      thesis={
        thesis
          ? {
              ...thesis,
              status: thesis.status,
              createdAt: thesis.createdAt.toISOString(),
              updatedAt: thesis.updatedAt.toISOString(),
              documents: thesis.documents.map((document) => ({
                ...document,
                createdAt: document.createdAt.toISOString(),
              })),
            }
          : null
      }
    />
  );
}
