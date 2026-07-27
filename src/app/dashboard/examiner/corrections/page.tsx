import { AssignmentStatus, CorrectionOrderStatus } from "@prisma/client";

import { CorrectionReviewPanel } from "@/components/corrections/correction-review-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function ExaminerCorrectionsPage() {
  const { auth } = await getServerDashboardContext("examiner");
  const orders = await prisma.correctionOrder.findMany({
    where: {
      status: CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
      requiresExaminerReview: true,
      thesis: {
        examinerAssignments: {
          some: {
            examinerUserId: auth.userId,
            status: AssignmentStatus.ACCEPTED,
            endedAt: null,
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      originatingThesisVersionId: true,
      requirementType: true,
      requiresExaminerReview: true,
      requirements: true,
      thesis: {
        select: {
          title: true,
          student: { select: { user: { select: { displayName: true } } } },
          examinerAssignments: {
            where: {
              examinerUserId: auth.userId,
              status: AssignmentStatus.ACCEPTED,
              endedAt: null,
            },
            select: { thesisVersionId: true },
          },
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
          Assigned Correction Reviews
        </h2>
        <p className="mt-2 text-muted-foreground">
          Review Supervisor-certified corrections bound to your originating
          thesis assignment.
        </p>
      </div>
      <CorrectionReviewPanel
        role="examiner"
        orders={orders.flatMap((order) => {
          const isAssignedToOrigin = order.thesis.examinerAssignments.some(
            (assignment) =>
              assignment.thesisVersionId ===
              order.originatingThesisVersionId,
          );
          const submission = order.submissions[0];
          return isAssignedToOrigin && submission
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
