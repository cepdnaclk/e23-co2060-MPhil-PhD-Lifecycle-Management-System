import { MilestoneStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

/**
 * Persist the overdue marker from the fixed obligation due date. Reporting
 * tables also derive overdue counts from dueDate so a delayed maintenance run
 * cannot hide an overdue obligation.
 */
export async function markOverdueProgressMilestones(
  referenceDate = new Date(),
) {
  const result = await prisma.studentMilestone.updateMany({
    where: {
      dueDate: { lt: referenceDate },
      status: {
        in: [MilestoneStatus.SCHEDULED, MilestoneStatus.DUE],
      },
    },
    data: {
      status: MilestoneStatus.OVERDUE,
    },
  });

  return result.count;
}
