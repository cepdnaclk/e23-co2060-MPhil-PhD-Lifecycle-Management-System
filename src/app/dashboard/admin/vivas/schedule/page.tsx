import { ThesisStatus } from "@prisma/client";

import { VivaSchedulePanel } from "@/components/admin/viva-schedule-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function AdminVivaSchedulePage() {
  await getServerDashboardContext("admin");

  const theses = await prisma.thesis.findMany({
    where: { status: ThesisStatus.UNDER_EXAMINATION },
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
      viva: {
        select: {
          id: true,
          scheduledDate: true,
          venue: true,
          outcome: true,
        },
      },
      examinerAssignments: {
        select: {
          id: true,
          examiner: {
            select: {
              user: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  return (
    <VivaSchedulePanel
      theses={theses.map((thesis) => ({
        ...thesis,
        status: thesis.status,
        viva: thesis.viva
          ? {
              ...thesis.viva,
              scheduledDate: thesis.viva.scheduledDate.toISOString(),
              outcome: thesis.viva.outcome,
            }
          : null,
      }))}
    />
  );
}
