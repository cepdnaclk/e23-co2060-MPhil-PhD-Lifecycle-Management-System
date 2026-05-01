import { UserRole, ThesisStatus } from "@prisma/client";

import { ExaminerAssignmentPanel } from "@/components/admin/examiner-assignment-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { listAdminManagedUsers } from "@/lib/admin/user-management";
import { prisma } from "@/lib/prisma/client";

export default async function AdminExaminerAssignmentsPage() {
  await getServerDashboardContext("admin");

  const [theses, examiners] = await Promise.all([
    prisma.thesis.findMany({
      where: {
        status: { in: [ThesisStatus.SUBMITTED, ThesisStatus.UNDER_EXAMINATION] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
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
        examinerAssignments: {
          select: {
            id: true,
            examinerId: true,
            examiner: {
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
    }),
    listAdminManagedUsers(UserRole.EXAMINER),
  ]);

  return (
    <ExaminerAssignmentPanel
      theses={theses}
      examiners={examiners.map((examiner) => ({
        id: examiner.id,
        displayName: examiner.displayName,
        email: examiner.email,
        examinerId: examiner.examinerId ?? null,
      }))}
    />
  );
}
