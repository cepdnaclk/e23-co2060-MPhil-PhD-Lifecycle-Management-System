import { prisma } from "@/lib/prisma/client";
import { ProgressSubmissionStatus } from "@prisma/client";

export const PROGRESS_REPORT_OVERDUE_AFTER_DAYS = Number(
  process.env.PROGRESS_REPORT_OVERDUE_AFTER_DAYS ?? 30,
);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getProgressReportOverdueCutoff(
  referenceDate = new Date(),
  overdueAfterDays = PROGRESS_REPORT_OVERDUE_AFTER_DAYS,
) {
  return new Date(referenceDate.getTime() - overdueAfterDays * DAY_IN_MS);
}

export async function markOverdueProgressReports(
  referenceDate = new Date(),
  overdueAfterDays = PROGRESS_REPORT_OVERDUE_AFTER_DAYS,
) {
  const cutoff = getProgressReportOverdueCutoff(referenceDate, overdueAfterDays);

  const result = await prisma.progressReport.updateMany({
    where: {
      isArchived: false,
      status: {
        in: [
          ProgressSubmissionStatus.DRAFT,
          ProgressSubmissionStatus.SUBMITTED,
          ProgressSubmissionStatus.RETURNED,
        ],
      },
      isOverdue: false,
      createdAt: {
        lt: cutoff,
      },
    },
    data: {
      isOverdue: true,
    },
  });

  return result.count;
}
