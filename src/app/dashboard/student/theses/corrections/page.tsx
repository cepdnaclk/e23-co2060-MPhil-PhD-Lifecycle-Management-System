import { ThesisCorrectionPanel } from "@/components/student/thesis-correction-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function StudentThesisCorrectionsPage() {
  const { auth } = await getServerDashboardContext("student");

  const order = await prisma.correctionOrder.findFirst({
    where: {
      thesis: {
        student: { userId: auth.userId },
        isArchived: false,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requirementType: true,
      requiresExaminerReview: true,
      requirements: true,
      dueDate: true,
      status: true,
      thesis: { select: { title: true } },
      submissions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          responseSummary: true,
          submittedAt: true,
          returnedAt: true,
          returnReason: true,
          documents: {
            where: { isDeleted: false },
            select: { id: true, fileName: true },
          },
          reviews: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              stage: true,
              decision: true,
              notes: true,
              reviewer: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  return (
    <ThesisCorrectionPanel
      order={
        order
          ? {
              ...order,
              dueDate: order.dueDate?.toISOString() ?? null,
              submissions: order.submissions.map((submission) => ({
                ...submission,
                submittedAt: submission.submittedAt.toISOString(),
                returnedAt: submission.returnedAt?.toISOString() ?? null,
              })),
            }
          : null
      }
    />
  );
}
