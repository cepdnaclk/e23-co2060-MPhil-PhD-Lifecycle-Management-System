import {
  AssignmentStatus,
  DepartmentDecision,
  SupervisorConsentStatus,
  UserRole,
} from "@prisma/client";

import {
  appendLifecycleEventAndEnqueue,
  appendLifecycleEvent,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class DepartmentApplicationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DepartmentApplicationError";
    this.status = status;
  }
}

export async function recordProposedSupervisorConsent(
  applicationId: string,
  decision: "CONSENTED" | "DECLINED",
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.SUPERVISOR) {
    throw new DepartmentApplicationError(
      "Only the named proposed supervisor can record consent.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        proposedSupervisorUserId: true,
        supervisorConsentStatus: true,
      },
    });

    if (!application) {
      throw new DepartmentApplicationError("Application not found.", 404);
    }

    if (application.proposedSupervisorUserId !== auth.userId) {
      throw new DepartmentApplicationError(
        "This consent request is assigned to another supervisor.",
        403,
      );
    }

    if (application.supervisorConsentStatus !== SupervisorConsentStatus.PENDING) {
      throw new DepartmentApplicationError(
        "Supervisor consent has already been recorded.",
        409,
      );
    }

    const updated = await tx.application.update({
      where: { id: application.id },
      data: {
        supervisorConsentStatus: decision,
        supervisorConsentRecordedAt: new Date(),
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `application:${application.id}:supervisor-consent:${decision.toLowerCase()}`,
      eventType: LIFECYCLE_EVENT.SUPERVISOR_CONSENT_RECORDED,
      aggregateType: "Application",
      aggregateId: application.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: SupervisorConsentStatus.PENDING,
      newState: decision,
    });

    return updated;
  });
}

export async function assignProposalReviewer(
  applicationId: string,
  reviewerUserId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new DepartmentApplicationError(
      "Only the PG Coordinator can assign proposal reviewers.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        supervisorConsentStatus: true,
        proposalVersions: {
          where: { isCurrent: true },
          take: 1,
          select: { id: true, title: true },
        },
      },
    });
    const reviewer = await tx.user.findUnique({
      where: { id: reviewerUserId },
      select: { id: true, role: true, isActive: true },
    });

    if (!application) {
      throw new DepartmentApplicationError("Application not found.", 404);
    }

    if (application.supervisorConsentStatus !== SupervisorConsentStatus.CONSENTED) {
      throw new DepartmentApplicationError(
        "Proposed supervisor consent is required before reviewer assignment.",
        409,
      );
    }

    if (
      !reviewer?.isActive ||
      (reviewer.role !== UserRole.SUPERVISOR &&
        reviewer.role !== UserRole.EXAMINER)
    ) {
      throw new DepartmentApplicationError(
        "Reviewer must be an active Supervisor or Examiner.",
        400,
      );
    }

    const version = application.proposalVersions[0];

    if (!version) {
      throw new DepartmentApplicationError(
        "A current proposal version is required.",
        409,
      );
    }

    const assignment = await tx.proposalReviewerAssignment.create({
      data: {
        applicationId: application.id,
        proposalVersionId: version.id,
        reviewerUserId: reviewer.id,
        assignedByUserId: auth.userId,
      },
    });
    await appendLifecycleEventAndEnqueue(
      tx as never,
      {
        eventKey: `proposal-review-assignment:${assignment.id}:assigned`,
        eventType: LIFECYCLE_EVENT.PROPOSAL_REVIEWER_ASSIGNED,
        aggregateType: "ProposalReviewerAssignment",
        aggregateId: assignment.id,
        actorUserId: auth.userId,
        actorRole: auth.role,
        newState: AssignmentStatus.PENDING,
      },
      [
        {
          eventKey: `proposal-review-assignment:${assignment.id}:notify`,
          recipientId: reviewer.id,
          notificationEvent: "EXAMINER_REVIEW_ASSIGNED",
          title: "Proposal review assigned",
          message: `You were assigned to review "${version.title}".`,
          actionUrl: "/dashboard",
        },
      ],
    );

    return assignment;
  });
}

export async function submitAssignedProposalReview(
  assignmentId: string,
  input: {
    decision:
      | "APPROVED"
      | "REVISION_REQUIRED"
      | "REJECTED";
    comments: string;
  },
  auth: AuthenticatedUserContext,
) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.proposalReviewerAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new DepartmentApplicationError("Reviewer assignment not found.", 404);
    }

    if (assignment.reviewerUserId !== auth.userId) {
      throw new DepartmentApplicationError(
        "This proposal review is assigned to another user.",
        403,
      );
    }

    if (
      assignment.status === AssignmentStatus.COMPLETED ||
      assignment.status === AssignmentStatus.CANCELLED
    ) {
      throw new DepartmentApplicationError(
        "This proposal review assignment is closed.",
        409,
      );
    }

    const review = await tx.proposalReview.create({
      data: {
        assignmentId: assignment.id,
        proposalVersionId: assignment.proposalVersionId,
        decision: input.decision,
        comments: input.comments,
      },
    });
    await tx.proposalReviewerAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssignmentStatus.COMPLETED,
        respondedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `proposal-review-assignment:${assignment.id}:submitted`,
      eventType: LIFECYCLE_EVENT.PROPOSAL_REVIEW_SUBMITTED,
      aggregateType: "ProposalReviewerAssignment",
      aggregateId: assignment.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: assignment.status,
      newState: AssignmentStatus.COMPLETED,
      metadata: { decision: input.decision },
    });

    return review;
  });
}

export async function recordHodAdmissionDecision(
  applicationId: string,
  input: {
    decision:
      | "APPROVED"
      | "REVISION_REQUIRED"
      | "REJECTED";
    reason: string;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.HOD) {
    throw new DepartmentApplicationError(
      "Only the Head of Department can record this decision.",
      403,
    );
  }

  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        departmentDecision: true,
        supervisorConsentStatus: true,
        proposalReviewerAssignments: {
          where: {
            proposalVersion: { isCurrent: true },
          },
          select: { status: true },
        },
      },
    });

    if (!application) {
      throw new DepartmentApplicationError("Application not found.", 404);
    }

    if (application.departmentDecision !== DepartmentDecision.PENDING) {
      throw new DepartmentApplicationError(
        "A Department decision has already been recorded.",
        409,
      );
    }

    if (application.supervisorConsentStatus !== SupervisorConsentStatus.CONSENTED) {
      throw new DepartmentApplicationError(
        "Supervisor consent is incomplete.",
        409,
      );
    }

    if (
      application.proposalReviewerAssignments.length < 2 ||
      application.proposalReviewerAssignments.some(
        (assignment) => assignment.status !== AssignmentStatus.COMPLETED,
      )
    ) {
      throw new DepartmentApplicationError(
        "Two completed reviews of the current proposal version are required.",
        409,
      );
    }

    const updated = await tx.application.update({
      where: { id: application.id },
      data: {
        departmentDecision: input.decision,
        hodDecisionByUserId: auth.userId,
        hodDecisionAt: new Date(),
        hodDecisionReason: input.reason,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `application:${application.id}:hod-decision:${input.decision.toLowerCase()}`,
      eventType: LIFECYCLE_EVENT.HOD_ADMISSION_DECIDED,
      aggregateType: "Application",
      aggregateId: application.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      previousState: DepartmentDecision.PENDING,
      newState: input.decision,
      metadata: { reason: input.reason },
    });

    return updated;
  });
}
