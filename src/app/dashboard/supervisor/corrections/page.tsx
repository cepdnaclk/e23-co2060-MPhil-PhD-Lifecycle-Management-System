import { CorrectionOrderStatus } from "@prisma/client";

import { CorrectionReviewPanel } from "@/components/corrections/correction-review-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function SupervisorCorrectionsPage() {
  const { auth } = await getServerDashboardContext("supervisor");
  const orders = await prisma.correctionOrder.findMany({
    where: {
      status: CorrectionOrderStatus.SUBMITTED,
      thesis: {
        student: {
          supervisorAssignments: {
            some: {
              supervisorUserId: auth.userId,
              effectiveTo: null,
              isPrimary: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      requirementType: true,
      requiresExaminerReview: true,
      requirements: true,
      thesis: {
        select: {
          title: true,
          student: { select: { user: { select: { displayName: true } } } },
        },
      },
      submissions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          versionNumber: true,
          responseSummary: true,
          documents: {
            where: { isDeleted: false },
            select: { id: true, fileName: true },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Correction Certification
        </h2>
        <p className="mt-2 text-muted-foreground">
          Certify verified correction versions for your actively assigned
          Students.
        </p>
      </div>
      <CorrectionReviewPanel
        role="supervisor"
        orders={orders.flatMap((order) => {
          const submission = order.submissions[0];
          return submission
            ? [
                {
                  id: order.id,
                  requirementType: order.requirementType,
                  requiresExaminerReview: order.requiresExaminerReview,
                  requirements: order.requirements,
                  studentName: order.thesis.student.user.displayName,
                  thesisTitle: order.thesis.title,
                  submission,
                },
              ]
            : [];
        })}
      />
    </div>
  );
}
