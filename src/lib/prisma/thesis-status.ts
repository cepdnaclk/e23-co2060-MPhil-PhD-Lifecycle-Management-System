import { ThesisStatus } from "@prisma/client";

const THESIS_STATUS_TRANSITIONS: Record<ThesisStatus, ThesisStatus[]> = {
  [ThesisStatus.SUBMITTED]: [ThesisStatus.UNDER_EXAMINATION],
  [ThesisStatus.UNDER_EXAMINATION]: [
    ThesisStatus.CORRECTIONS_REQUIRED,
    ThesisStatus.COMPLETED,
  ],
  [ThesisStatus.CORRECTIONS_REQUIRED]: [ThesisStatus.CORRECTIONS_APPROVED],
  [ThesisStatus.CORRECTIONS_APPROVED]: [ThesisStatus.COMPLETED],
  [ThesisStatus.COMPLETED]: [ThesisStatus.FINAL_ARCHIVE],
  [ThesisStatus.FINAL_ARCHIVE]: [ThesisStatus.CLOSED],
  [ThesisStatus.CLOSED]: [],
};

export function assertValidThesisStatusTransition(
  currentStatus: ThesisStatus,
  nextStatus: ThesisStatus,
) {
  const allowedTransitions = THESIS_STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error(
      `Invalid thesis status transition: ${currentStatus} -> ${nextStatus}`,
    );
  }
}
