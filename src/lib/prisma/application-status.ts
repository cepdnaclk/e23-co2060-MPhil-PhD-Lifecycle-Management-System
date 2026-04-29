import { ApplicationStatus } from "@prisma/client";

const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW],
  [ApplicationStatus.UNDER_REVIEW]: [
    ApplicationStatus.ADMITTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.ADMITTED]: [],
  [ApplicationStatus.REJECTED]: [],
};

export function assertValidApplicationStatusTransition(
  currentStatus: ApplicationStatus,
  nextStatus: ApplicationStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTransitions = validTransitions[currentStatus];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error(
      `Invalid application status transition: ${currentStatus} -> ${nextStatus}`,
    );
  }
}
