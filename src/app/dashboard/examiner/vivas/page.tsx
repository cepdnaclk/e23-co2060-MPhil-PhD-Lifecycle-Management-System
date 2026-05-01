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
              some: { examinerId: examiner.id },
            },
          },
        },
        orderBy: { scheduledDate: "asc" },
        select: {
          id: true,
          scheduledDate: true,
          venue: true,
          outcome: true,
          thesis: {
            select: {
              id: true,
              title: true,
              abstract: true,
              status: true,
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
      vivas={vivas.map((viva) => ({
        ...viva,
        scheduledDate: viva.scheduledDate.toISOString(),
        outcome: viva.outcome,
        thesis: {
          ...viva.thesis,
          status: viva.thesis.status,
        },
      }))}
    />
  );
}
