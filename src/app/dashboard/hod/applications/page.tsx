import { AssignmentStatus, DepartmentDecision } from "@prisma/client";

import { HodApplicationDecisionPanel } from "@/components/hod/department-decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function HodApplicationsPage() {
  await getServerDashboardContext("hod");
  const applications = await prisma.application.findMany({
    where: { departmentDecision: DepartmentDecision.PENDING, isArchived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      applicantName: true,
      programType: true,
      studyMode: true,
      proposalTitle: true,
      supervisorConsentStatus: true,
      proposalReviewerAssignments: {
        where: {
          status: AssignmentStatus.COMPLETED,
          proposalVersion: { isCurrent: true },
        },
        select: { id: true },
      },
    },
  });

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div><h2 className="text-3xl font-bold tracking-tight">Admission decisions</h2><p className="mt-2 text-muted-foreground">Decide only after consent and two exact-version reviews.</p></div>
      <HodApplicationDecisionPanel applications={applications.map((application) => ({
        ...application,
        programType: application.programType,
        studyMode: application.studyMode,
        supervisorConsentStatus: application.supervisorConsentStatus,
        completedReviews: application.proposalReviewerAssignments.length,
      }))} />
    </div>
  );
}
