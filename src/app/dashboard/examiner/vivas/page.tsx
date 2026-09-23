import { VivaWorkspacePanel } from "@/components/examiner/viva-workspace-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function ExaminerVivasPage() {
  const { auth } = await getServerDashboardContext("examiner");

  const examiner = await prisma.examiner.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  const vivas = examiner
    ? await prisma.viva.findMany({
        where: {
          thesis: {
            examinerAssignments: {
              some: { examinerId: examiner.id, status: "ACCEPTED" },
            },
          },
        },
        orderBy: { scheduledDate: "asc" },
        select: {
          id: true,
          scheduledDate: true,
          venue: true,
          outcome: true,
          recommendations: {
            where: { authorUserId: auth.userId },
            take: 1,
            select: { recommendation: true },
          },
          thesis: {
            select: {
              id: true,
              title: true,
              abstract: true,
              status: true,
              examinerAssignments: {
                where: { examinerId: examiner.id, status: "ACCEPTED" },
                take: 1,
                select: {
                  id: true,
                  report: { select: { id: true } },
                  documents: {
                    where: { documentType: "REVIEW_ATTACHMENT", isDeleted: false },
                    take: 1,
                    select: { id: true, fileName: true },
                  },
                },
              },
              student: {
                select: {
                  user: {
                    select: {
                      displayName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  return (
    <VivaWorkspacePanel
      vivas={vivas.map((viva) => {
        const { examinerAssignments, ...thesis } = viva.thesis;
        return {
          ...viva,
          scheduledDate: viva.scheduledDate.toISOString(),
          outcome: viva.outcome,
          recommendation: viva.recommendations[0]?.recommendation ?? null,
          assignment: {
            id: examinerAssignments[0]?.id ?? "",
            reportSubmitted: Boolean(examinerAssignments[0]?.report),
            reportDocument: examinerAssignments[0]?.documents[0] ?? null,
          },
          thesis: {
            ...thesis,
            status: thesis.status,
          },
        };
      })}
    />
  );
}
