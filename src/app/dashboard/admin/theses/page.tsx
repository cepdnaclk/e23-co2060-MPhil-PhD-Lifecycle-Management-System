import { ThesisStatus } from "@prisma/client";

import { ThesisFinalizationPanel } from "@/components/admin/thesis-finalization-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function AdminThesesPage() {
  await getServerDashboardContext("admin");

  const theses = await prisma.thesis.findMany({
    where: {
      status: {
        in: [ThesisStatus.CORRECTIONS_REQUIRED, ThesisStatus.FINAL_ARCHIVE],
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
      corrections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          correctionType: true,
          description: true,
          isApproved: true,
          createdAt: true,
          documents: {
            select: {
              id: true,
              fileName: true,
              storagePath: true,
            },
          },
        },
      },
    },
  });

  return (
    <ThesisFinalizationPanel
      theses={theses.map((thesis) => ({
        ...thesis,
        status: thesis.status,
        corrections: thesis.corrections.map((correction) => ({
          ...correction,
          correctionType: correction.correctionType,
          createdAt: correction.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
