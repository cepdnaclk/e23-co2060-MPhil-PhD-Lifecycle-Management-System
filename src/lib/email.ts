import {
  NotificationDeliveryStatus,
  NotificationEvent,
} from "@prisma/client";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/prisma/client";

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  recipientUserId: string;
  event: NotificationEvent;
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

let cachedTransporter:
  | ReturnType<typeof nodemailer.createTransport>
  | undefined;

function getRequiredSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.",
    );
  }

  return {
    host,
    port: Number(port),
    user,
    pass,
    from: process.env.SMTP_FROM ?? user,
  };
}

export function getEmailTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getRequiredSmtpConfig();

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return cachedTransporter;
}

export function resetEmailTransporterForTests() {
  cachedTransporter = undefined;
}

async function writeNotificationLog(
  input: SendEmailInput,
  deliveryStatus: NotificationDeliveryStatus,
  failureReason?: string,
) {
  try {
    await prisma.notificationLog.create({
      data: {
        recipientId: input.recipientUserId,
        event: input.event,
        subject: input.subject,
        deliveryStatus,
        failureReason,
        metadata: {
          to: input.to,
        },
      },
    });
  } catch (error) {
    console.error("Failed to write NotificationLog entry.", error);
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getEmailTransporter();
  const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";

  try {
    const result = await transporter.sendMail({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    await writeNotificationLog(input, NotificationDeliveryStatus.SENT);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : "Unknown SMTP transport error.";

    await writeNotificationLog(
      input,
      NotificationDeliveryStatus.FAILED,
      failureReason,
    );

    return {
      success: false,
      error: failureReason,
    };
  }
}

export function sendEmailInBackground(input: SendEmailInput): Promise<void> {
  return Promise.resolve().then(async () => {
    await sendEmail(input);
  });
}

export function buildRegistrationExpiryTemplate(input: {
  studentName: string;
  expirationDateLabel: string;
  daysRemaining?: number;
}): EmailTemplate {
  const daysRemaining = input.daysRemaining ?? 14;
  const subject = `Registration expiry reminder: ${daysRemaining} days remaining`;
  const text = [
    `Dear ${input.studentName},`,
    "",
    `Your registration will expire on ${input.expirationDateLabel}.`,
    `Please renew within the next ${daysRemaining} days to avoid a lapse.`,
  ].join("\n");
  const html = `
    <p>Dear ${input.studentName},</p>
    <p>Your registration will expire on <strong>${input.expirationDateLabel}</strong>.</p>
    <p>Please renew within the next <strong>${daysRemaining} days</strong> to avoid a lapse.</p>
  `;

  return { subject, html, text };
}

export function buildProposalStatusChangeTemplate(input: {
  studentName: string;
  proposalTitle: string;
  statusLabel: string;
  feedback?: string;
}): EmailTemplate {
  const subject = `Proposal status updated: ${input.statusLabel}`;
  const feedbackText = input.feedback
    ? `\n\nFeedback:\n${input.feedback}`
    : "";
  const feedbackHtml = input.feedback
    ? `<p><strong>Feedback:</strong><br />${input.feedback}</p>`
    : "";
  const text = [
    `Dear ${input.studentName},`,
    "",
    `Your proposal "${input.proposalTitle}" is now ${input.statusLabel}.`,
    feedbackText.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <p>Dear ${input.studentName},</p>
    <p>Your proposal "<strong>${input.proposalTitle}</strong>" is now <strong>${input.statusLabel}</strong>.</p>
    ${feedbackHtml}
  `;

  return { subject, html, text };
}

export function buildProgressReportSubmittedTemplate(input: {
  supervisorName: string;
  studentName: string;
  periodLabel: string;
}): EmailTemplate {
  const subject = `Progress report submitted for ${input.periodLabel}`;
  const text = [
    `Dear ${input.supervisorName},`,
    "",
    `${input.studentName} has submitted a progress report for ${input.periodLabel}.`,
    "Please review and sign off the report in the system.",
  ].join("\n");
  const html = `
    <p>Dear ${input.supervisorName},</p>
    <p><strong>${input.studentName}</strong> has submitted a progress report for <strong>${input.periodLabel}</strong>.</p>
    <p>Please review and sign off the report in the system.</p>
  `;

  return { subject, html, text };
}

export async function notifyRegistrationExpiry(input: {
  recipientUserId: string;
  to: string;
  studentName: string;
  expirationDateLabel: string;
  daysRemaining?: number;
}) {
  const template = buildRegistrationExpiryTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.REGISTRATION_EXPIRY_APPROACHING,
    ...template,
  });
}

export async function notifyProposalStatusChange(input: {
  recipientUserId: string;
  to: string;
  studentName: string;
  proposalTitle: string;
  statusLabel: string;
  feedback?: string;
}) {
  const template = buildProposalStatusChangeTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.PROPOSAL_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyProgressReportSubmitted(input: {
  recipientUserId: string;
  to: string;
  supervisorName: string;
  studentName: string;
  periodLabel: string;
}) {
  const template = buildProgressReportSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.PROGRESS_REPORT_SUBMITTED,
    ...template,
  });
}
