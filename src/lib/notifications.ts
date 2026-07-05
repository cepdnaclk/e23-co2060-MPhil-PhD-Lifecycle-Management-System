/**
 * NotificationService — PB-070
 *
 * Centralised event-driven notification dispatcher. Handles both:
 *   1. Email delivery (via the existing `sendEmail` / `notify*` functions)
 *   2. In-app Notification record persistence (Notification table)
 *
 * Every attempt, successful or failed, is logged to NotificationLog (REQ-FN-020).
 * A failed SMTP send NEVER crashes the calling workflow — it is recorded as FAILED.
 *
 * Supported events
 * ─────────────────
 *  APPLICATION_STATUS_CHANGED
 *  PROPOSAL_STATUS_CHANGED
 *  ETHICS_APPROVAL_SUBMITTED
 *  ETHICS_APPROVAL_STATUS_CHANGED
 *  PROGRESS_REPORT_SUBMITTED   ← SLA: supervisor notified within 1 h (REQ-FN-019)
 *  REGISTRATION_EXPIRY_APPROACHING ← 14-day advance (REQ-FN-018)
 *  VIVA_SCHEDULED
 *  CORRECTIONS_REQUIRED
 *  THESIS_ARCHIVED
 */

import { NotificationEvent } from "@prisma/client";

import {
  notifyEthicsApprovalStatusChanged,
  notifyEthicsApprovalSubmittedToAdministrator,
  notifyApplicationStatusChanged,
  notifyCorrectionSubmittedToAdministrator,
  notifyProgressReportSubmitted,
  notifyProposalStatusChange,
  notifyRegistrationExpiry,
  notifyThesisArchived,
  notifyVivaScheduled,
} from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

// ---------------------------------------------------------------------------
// Payload types per event
// ---------------------------------------------------------------------------

export type ApplicationStatusChangedPayload = {
  event: "APPLICATION_STATUS_CHANGED";
  recipientUserId: string;
  to: string;
  studentName: string;
  newStatus: string;
  programTypeLabel: string;
};

export type ProposalStatusChangedPayload = {
  event: "PROPOSAL_STATUS_CHANGED";
  recipientUserId: string;
  to: string;
  studentName: string;
  proposalTitle: string;
  statusLabel: string;
  feedback?: string;
};

export type EthicsApprovalSubmittedPayload = {
  event: "ETHICS_APPROVAL_SUBMITTED";
  recipientUserId: string;
  to: string;
  administratorName: string;
  studentName: string;
  studentId: string;
  applicationTitle: string;
};

export type EthicsApprovalStatusChangedPayload = {
  event: "ETHICS_APPROVAL_STATUS_CHANGED";
  recipientUserId: string;
  to: string;
  studentName: string;
  studentId: string;
  applicationTitle: string;
  statusLabel: string;
  reviewNotes?: string;
};

export type ProgressReportSubmittedPayload = {
  event: "PROGRESS_REPORT_SUBMITTED";
  recipientUserId: string;   // supervisor's userId
  to: string;                // supervisor's email
  supervisorName: string;
  studentName: string;
  studentId: string;
  periodLabel: string;
};

export type RegistrationExpiryPayload = {
  event: "REGISTRATION_EXPIRY_APPROACHING";
  recipientUserId: string;
  to: string;
  studentName: string;
  expirationDateLabel: string;
  daysRemaining?: number;
};

export type ThesisArchivedPayload = {
  event: "THESIS_ARCHIVED";
  recipientUserId: string;
  to: string;
  studentName: string;
  thesisTitle: string;
};

export type VivaScheduledPayload = {
  event: "VIVA_SCHEDULED";
  recipientUserId: string;
  to: string;
  recipientName: string;
  thesisTitle: string;
  venue: string;
  scheduledDate: Date;
};

export type CorrectionsRequiredPayload = {
  event: "CORRECTIONS_REQUIRED";
  recipientUserId: string;
  to: string;
  administratorName: string;
  studentName: string;
  thesisTitle: string;
  correctionTypeLabel: string;
};

export type NotificationPayload =
  | ApplicationStatusChangedPayload
  | ProposalStatusChangedPayload
  | EthicsApprovalSubmittedPayload
  | EthicsApprovalStatusChangedPayload
  | ProgressReportSubmittedPayload
  | RegistrationExpiryPayload
  | ThesisArchivedPayload
  | VivaScheduledPayload
  | CorrectionsRequiredPayload;

// ---------------------------------------------------------------------------
// In-app Notification record helpers
// ---------------------------------------------------------------------------

async function writeInAppNotification(
  recipientUserId: string,
  studentId: string | null,
  event: NotificationEvent,
  title: string,
  message: string,
) {
  try {
    await prisma.notification.create({
      data: {
        recipientId: recipientUserId,
        studentId,
        event,
        title,
        message,
      },
    });
  } catch (error) {
    console.error("[NotificationService] Failed to write in-app notification.", error);
  }
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

export async function notify(payload: NotificationPayload): Promise<void> {
  switch (payload.event) {
    case "APPLICATION_STATUS_CHANGED": {
      await notifyApplicationStatusChanged({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        studentName: payload.studentName,
        newStatus: payload.newStatus,
        programTypeLabel: payload.programTypeLabel,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.APPLICATION_STATUS_CHANGED,
        `Application status updated: ${payload.newStatus}`,
        `Your ${payload.programTypeLabel} application status has changed to ${payload.newStatus}.`,
      );
      break;
    }

    case "PROPOSAL_STATUS_CHANGED": {
      await notifyProposalStatusChange({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        studentName: payload.studentName,
        proposalTitle: payload.proposalTitle,
        statusLabel: payload.statusLabel,
        feedback: payload.feedback,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.PROPOSAL_STATUS_CHANGED,
        `Proposal status updated: ${payload.statusLabel}`,
        `Your proposal "${payload.proposalTitle}" is now ${payload.statusLabel}.`,
      );
      break;
    }

    case "ETHICS_APPROVAL_SUBMITTED": {
      await notifyEthicsApprovalSubmittedToAdministrator({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        administratorName: payload.administratorName,
        studentName: payload.studentName,
        applicationTitle: payload.applicationTitle,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        payload.studentId,
        NotificationEvent.ETHICS_APPROVAL_SUBMITTED,
        `Ethics approval submitted: ${payload.applicationTitle}`,
        `${payload.studentName} submitted an ethics approval application for review.`,
      );
      break;
    }

    case "ETHICS_APPROVAL_STATUS_CHANGED": {
      await notifyEthicsApprovalStatusChanged({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        studentName: payload.studentName,
        applicationTitle: payload.applicationTitle,
        statusLabel: payload.statusLabel,
        reviewNotes: payload.reviewNotes,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        payload.studentId,
        NotificationEvent.ETHICS_APPROVAL_STATUS_CHANGED,
        `Ethics approval status updated: ${payload.statusLabel}`,
        `Your ethics approval application "${payload.applicationTitle}" is now ${payload.statusLabel}.`,
      );
      break;
    }

    case "PROGRESS_REPORT_SUBMITTED": {
      // SLA: supervisor email dispatched immediately (within the same request cycle, REQ-FN-019)
      await notifyProgressReportSubmitted({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        supervisorName: payload.supervisorName,
        studentName: payload.studentName,
        periodLabel: payload.periodLabel,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        payload.studentId,
        NotificationEvent.PROGRESS_REPORT_SUBMITTED,
        `Progress report submitted: ${payload.periodLabel}`,
        `${payload.studentName} has submitted a progress report for ${payload.periodLabel}. Please review and sign off.`,
      );
      break;
    }

    case "REGISTRATION_EXPIRY_APPROACHING": {
      await notifyRegistrationExpiry({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        studentName: payload.studentName,
        expirationDateLabel: payload.expirationDateLabel,
        daysRemaining: payload.daysRemaining ?? 14,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.REGISTRATION_EXPIRY_APPROACHING,
        `Registration expiry reminder`,
        `Your registration expires on ${payload.expirationDateLabel}. Please renew within ${payload.daysRemaining ?? 14} days.`,
      );
      break;
    }

    case "THESIS_ARCHIVED": {
      await notifyThesisArchived({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        studentName: payload.studentName,
        thesisTitle: payload.thesisTitle,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.THESIS_ARCHIVED,
        `Thesis archived`,
        `Your thesis "${payload.thesisTitle}" has been archived in the system.`,
      );
      break;
    }

    case "VIVA_SCHEDULED": {
      await notifyVivaScheduled({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        recipientName: payload.recipientName,
        thesisTitle: payload.thesisTitle,
        venue: payload.venue,
        scheduledDate: payload.scheduledDate,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.VIVA_SCHEDULED,
        `Viva scheduled: ${payload.thesisTitle}`,
        `A viva has been scheduled at ${payload.venue} on ${payload.scheduledDate.toLocaleString()}.`,
      );
      break;
    }

    case "CORRECTIONS_REQUIRED": {
      await notifyCorrectionSubmittedToAdministrator({
        recipientUserId: payload.recipientUserId,
        to: payload.to,
        administratorName: payload.administratorName,
        studentName: payload.studentName,
        thesisTitle: payload.thesisTitle,
        correctionTypeLabel: payload.correctionTypeLabel,
      });

      await writeInAppNotification(
        payload.recipientUserId,
        null,
        NotificationEvent.CORRECTIONS_REQUIRED,
        `Correction submitted: ${payload.thesisTitle}`,
        `${payload.studentName} submitted a ${payload.correctionTypeLabel.toLowerCase()} correction package for review.`,
      );
      break;
    }

    default: {
      const _exhaustive: never = payload;
      console.warn("[NotificationService] Unhandled notification event.", _exhaustive);
    }
  }
}

/**
 * Fire-and-forget wrapper. Errors are swallowed to prevent crashing the
 * calling workflow — consistent with the existing `sendEmailInBackground` pattern.
 */
export function notifyInBackground(payload: NotificationPayload): void {
  void notify(payload).catch((error) => {
    console.error("[NotificationService] Background notification failed.", error);
  });
}
