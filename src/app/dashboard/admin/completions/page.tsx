import { CompletionLifecyclePanel } from "@/components/admin/completion-lifecycle-panel";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";

export default async function AdminCompletionsPage() {
  await getServerDashboardContext("admin");

  const students = await prisma.student.findMany({
    where: {
      programmeCompletion: { isNot: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      programType: true,
      studyMode: true,
      user: {
        select: {
          displayName: true,
          email: true,
        },
      },
      programmeCompletion: {
        select: {
          status: true,
          hodApprovedAt: true,
          hodComments: true,
          completedAt: true,
          thesis: { select: { title: true } },
        },
      },
      graduationRecord: {
        select: {
          status: true,
          graduationDate: true,
          confirmationReference: true,
        },
      },
      archiveRecord: {
        select: {
          status: true,
          archivedAt: true,
          reason: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Completion, graduation, and archive
        </h1>
        <p className="mt-2 text-muted-foreground">
          Execute HOD-approved completion, record externally confirmed
          graduation, and archive completed lifecycle records as separate
          operations.
        </p>
      </div>
      <CompletionLifecyclePanel
        students={students.flatMap((student) =>
          student.programmeCompletion
            ? [
                {
                  id: student.id,
                  studentName: student.user.displayName,
                  email: student.user.email,
                  programmeLabel: `${student.programType} ${student.studyMode.replaceAll("_", " ")}`,
                  thesisTitle: student.programmeCompletion.thesis.title,
                  completion: {
                    status: student.programmeCompletion.status,
                    hodApprovedAt:
                      student.programmeCompletion.hodApprovedAt?.toISOString() ??
                      null,
                    hodComments: student.programmeCompletion.hodComments,
                    completedAt:
                      student.programmeCompletion.completedAt?.toISOString() ??
                      null,
                  },
                  graduation: student.graduationRecord
                    ? {
                        status: student.graduationRecord.status,
                        graduationDate:
                          student.graduationRecord.graduationDate?.toISOString() ??
                          null,
                        confirmationReference:
                          student.graduationRecord.confirmationReference,
                      }
                    : null,
                  archive: student.archiveRecord
                    ? {
                        status: student.archiveRecord.status,
                        archivedAt:
                          student.archiveRecord.archivedAt?.toISOString() ??
                          null,
                        reason: student.archiveRecord.reason,
                      }
                    : null,
                },
              ]
            : [],
        )}
      />
    </div>
  );
}
