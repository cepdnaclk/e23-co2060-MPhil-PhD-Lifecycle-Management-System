import { ProposalStatus, UserRole } from "@prisma/client";

const validTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  [ProposalStatus.SUBMITTED]: [
    ProposalStatus.UNDER_REVIEW,
    ProposalStatus.REJECTED,
  ],
  [ProposalStatus.UNDER_REVIEW]: [
    ProposalStatus.APPROVED,
    ProposalStatus.REJECTED,
  ],
  [ProposalStatus.APPROVED]: [],
  [ProposalStatus.REJECTED]: [ProposalStatus.SUBMITTED],
};

export function assertValidProposalStatusTransition(
  currentStatus: ProposalStatus,
  nextStatus: ProposalStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTransitions = validTransitions[currentStatus];

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error(
      `Invalid proposal status transition: ${currentStatus} -> ${nextStatus}`,
    );
  }
}

export function assertCanApproveProposal(actorRole: UserRole): void {
  if (actorRole !== UserRole.ADMINISTRATOR) {
    throw new Error(
      "Only an Administrator can transition a proposal to APPROVED.",
    );
  }
}
