import type { Prisma } from "@prisma/client";

import {
  enqueueOutboxMessage,
  type EnqueueOutboxInput,
} from "@/lib/outbox/service";

/**
 * Stable event names used across the Department V1 lifecycle. The audit table
 * intentionally stores text so new event names can be deployed additively.
 */
export const LIFECYCLE_EVENT = {
  APPLICATION_SUBMITTED: "application.submitted",
  SUPERVISOR_CONSENT_REQUESTED: "application.supervisor_consent_requested",
  SUPERVISOR_CONSENT_RECORDED: "application.supervisor_consent_recorded",
  PROPOSAL_REVIEWER_ASSIGNED: "application.proposal_reviewer_assigned",
  PROPOSAL_REVIEW_SUBMITTED: "application.proposal_review_submitted",
  PROPOSAL_REVISION_SUBMITTED: "application.proposal_revision_submitted",
  HOD_ADMISSION_DECIDED: "application.hod_admission_decided",
  ADMISSION_EXECUTED: "student.admission_executed",
  SUPERVISOR_ASSIGNED: "student.supervisor_assigned",
  SUPERVISOR_ASSIGNMENT_ENDED: "student.supervisor_assignment_ended",
  PROGRESS_SUBMITTED: "progress.submitted",
  PROGRESS_RETURNED: "progress.returned",
  PROGRESS_APPROVED: "progress.approved",
  PROGRESS_TABLE_EXPORTED: "progress.table_exported",
  ETHICS_APPLICABILITY_RECORDED: "ethics.applicability_recorded",
  ETHICS_STATUS_RECORDED: "ethics.status_recorded",
  ETHICS_STUDENT_DECLARED: "ethics.student_declared",
  ETHICS_SUPERVISOR_DECIDED: "ethics.supervisor_decided",
  ETHICS_COORDINATOR_DECIDED: "ethics.coordinator_decided",
  ETHICS_HOD_DECIDED: "ethics.hod_decided",
  THESIS_READINESS_CERTIFIED: "thesis.readiness_certified",
  THESIS_READINESS_REQUESTED: "thesis.readiness_requested",
  THESIS_READINESS_HOD_DECIDED: "thesis.readiness_hod_decided",
  THESIS_SUBMITTED: "thesis.submitted",
  THESIS_EXAMINER_ASSIGNED: "thesis.examiner_assigned",
  THESIS_REPORT_SUBMITTED: "thesis.report_submitted",
  VIVA_RECOMMENDATION_SUBMITTED: "viva.recommendation_submitted",
  HOD_VIVA_OUTCOME_RECORDED: "viva.hod_outcome_recorded",
  CORRECTIONS_ORDERED: "corrections.ordered",
  CORRECTIONS_SUBMITTED: "corrections.submitted",
  CORRECTIONS_COMPLETION_APPROVED: "corrections.hod_completion_approved",
  PROGRAMME_COMPLETION_RECORDED: "student.programme_completion_recorded",
  GRADUATION_RECORDED: "student.graduation_recorded",
  RECORD_ARCHIVED: "student.record_archived",
} as const;

export type LifecycleEventType =
  (typeof LIFECYCLE_EVENT)[keyof typeof LIFECYCLE_EVENT];

export type LifecycleAuditInput = {
  eventKey: string;
  eventType: LifecycleEventType | (string & {});
  aggregateType: string;
  aggregateId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  actorLabel?: string | null;
  previousState?: string | null;
  newState?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

type AuditWriter = Pick<Prisma.TransactionClient, "lifecycleAuditEvent">;

export function appendLifecycleEvent(
  transaction: AuditWriter,
  input: LifecycleAuditInput,
) {
  return transaction.lifecycleAuditEvent.create({
    data: {
      eventKey: input.eventKey,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      actorLabel: input.actorLabel ?? null,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

type LifecycleTransaction = Pick<
  Prisma.TransactionClient,
  "lifecycleAuditEvent" | "outboxMessage"
>;

/**
 * Convenience helper for domain transitions that must never commit without
 * their audit record and delivery intent. The caller still owns the enclosing
 * Prisma transaction containing the domain mutation.
 */
export async function appendLifecycleEventAndEnqueue(
  transaction: LifecycleTransaction,
  audit: LifecycleAuditInput,
  messages: EnqueueOutboxInput[],
) {
  const event = await appendLifecycleEvent(transaction, audit);
  const outboxMessages = [];

  for (const message of messages) {
    outboxMessages.push(await enqueueOutboxMessage(transaction, message));
  }

  return { event, outboxMessages };
}
