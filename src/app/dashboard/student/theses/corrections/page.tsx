import { ThesisCorrectionPanel } from "@/components/student/thesis-correction-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function StudentThesisCorrectionsPage() {
  const { auth } = await getServerDashboardContext("student");

  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      theses: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          title: true,
          status: true,
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
                  version: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const thesis = student?.theses[0] ?? null;

  return (
    <ThesisCorrectionPanel
      thesis={
        thesis
          ? {
              ...thesis,
              status: thesis.status,
              corrections: thesis.corrections.map((correction) => ({
                ...correction,
                correctionType: correction.correctionType,
                createdAt: correction.createdAt.toISOString(),
              })),
            }
          : null
      }
    />
  );
}
