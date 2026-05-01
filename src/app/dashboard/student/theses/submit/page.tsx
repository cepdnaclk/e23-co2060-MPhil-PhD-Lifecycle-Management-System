import { ThesisSubmissionPanel } from "@/components/student/thesis-submission-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function StudentThesisSubmitPage() {
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

  return (
    <ThesisSubmissionPanel
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
