import { ThesisStatus } from "@prisma/client";

import { ThesisFinalizationPanel } from "@/components/admin/thesis-finalization-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function AdminThesesPage() {
  await getServerDashboardContext("admin");

  const theses = await prisma.thesis.findMany({
    where: {
      status: {
        in: [
          ThesisStatus.CORRECTIONS_REQUIRED,
          ThesisStatus.CORRECTIONS_APPROVED,
          ThesisStatus.FINAL_ARCHIVE,
        ],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      student: {
        select: {
          user: { select: { displayName: true, email: true } },
        },
      },
      correctionOrders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          requirementType: true,
          requiresExaminerReview: true,
          requirements: true,
          status: true,
          createdAt: true,
          submissions: {
            orderBy: { versionNumber: "desc" },
            select: {
              id: true,
              versionNumber: true,
              responseSummary: true,
              submittedAt: true,
              documents: {
                where: { isDeleted: false },
                select: {
                  id: true,
                  fileName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-8">
      <ThesisFinalizationPanel
        theses={theses.map((thesis) => ({
          ...thesis,
          status: thesis.status,
          correctionOrders: thesis.correctionOrders.map((order) => ({
            ...order,
            createdAt: order.createdAt.toISOString(),
            submissions: order.submissions.map((submission) => ({
              ...submission,
              submittedAt: submission.submittedAt.toISOString(),
            })),
          })),
        }))}
      />
    </div>
  );
}
