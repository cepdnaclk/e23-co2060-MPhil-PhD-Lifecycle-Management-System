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

type TrustedEmailHtml = {
  readonly value: string;
  readonly trusted: true;
};

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function trustedEmailHtml(value: string): TrustedEmailHtml {
  return { value, trusted: true };
}

function isTrustedEmailHtml(value: unknown): value is TrustedEmailHtml {
  return (
    typeof value === "object" &&
    value !== null &&
    "trusted" in value &&
    value.trusted === true &&
    "value" in value &&
    typeof value.value === "string"
  );
}

function emailHtml(
  strings: TemplateStringsArray,
  ...values: Array<unknown | TrustedEmailHtml>
) {
  return strings.reduce((result, part, index) => {
    const value = values[index];
    const renderedValue =
      isTrustedEmailHtml(value)
        ? value.value
        : value === undefined
          ? ""
          : escapeHtml(value);

    return result + part + renderedValue;
  }, "");
}

function optionalLabeledParagraph(label: string, value?: string) {
  return trustedEmailHtml(
    value ? emailHtml`<p><strong>${label}:</strong><br />${value}</p>` : "",
  );
}

function validateEmailLink(value: string) {
  const url = new URL(value);

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new Error("Email links must use an HTTP(S) URL without credentials.");
  }

  return url.toString();
}

function sanitizeEmailHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

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
        subject: sanitizeEmailHeader(input.subject),
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
  try {
    const transporter = getEmailTransporter();
    const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
    const safeInput = {
      ...input,
      subject: sanitizeEmailHeader(input.subject),
    };

    const result = await transporter.sendMail({
      from: fromAddress,
      to: safeInput.to,
      subject: safeInput.subject,
      html: safeInput.html,
      text: safeInput.text,
    });

    await writeNotificationLog(safeInput, NotificationDeliveryStatus.SENT);

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
  const feedbackHtml = optionalLabeledParagraph("Feedback", input.feedback);
  const text = [
    `Dear ${input.studentName},`,
    "",
    `Your proposal "${input.proposalTitle}" is now ${input.statusLabel}.`,
    feedbackText.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  const html = emailHtml`
    <p>Dear ${input.studentName},</p>
    <p>Your proposal "<strong>${input.proposalTitle}</strong>" is now <strong>${input.statusLabel}</strong>.</p>
    ${feedbackHtml}
  `;

  return { subject, html, text };
}

export function buildEthicsApprovalSubmittedTemplate(input: {
  administratorName: string;
  studentName: string;
  applicationTitle: string;
}): EmailTemplate {
  const subject = `Ethics approval submitted: ${input.applicationTitle}`;
  const text = [
    `Dear ${input.administratorName},`,
    "",
    `${input.studentName} has submitted an ethics approval application.`,
    `Application title: ${input.applicationTitle}`,
    "Please review the application in the ethics approval workflow.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.administratorName},</p>
    <p><strong>${input.studentName}</strong> has submitted an ethics approval application.</p>
    <p><strong>Application title:</strong> ${input.applicationTitle}</p>
    <p>Please review the application in the ethics approval workflow.</p>
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
    "Please sign in to view and monitor the submitted report.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.supervisorName},</p>
    <p><strong>${input.studentName}</strong> has submitted a progress report for <strong>${input.periodLabel}</strong>.</p>
    <p>Please sign in to view and monitor the submitted report.</p>
  `;

  return { subject, html, text };
}

export function buildWelcomeAccountTemplate(input: {
  recipientName: string;
  roleLabel: string;
  accountSetupUrl: string;
}): EmailTemplate {
  const accountSetupUrl = validateEmailLink(input.accountSetupUrl);
  const subject = `Your ${input.roleLabel.toLowerCase()} account is ready`;
  const text = [
    `Dear ${input.recipientName},`,
    "",
    `An account has been created for you in the Postgraduate Lifecycle Management System as a ${input.roleLabel}.`,
    `Set your password: ${accountSetupUrl}`,
    "This one-time Firebase link expires automatically. If it has expired or was already used, request a new password-reset link.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.recipientName},</p>
    <p>An account has been created for you in the Postgraduate Lifecycle Management System as a <strong>${input.roleLabel}</strong>.</p>
    <p><a href="${accountSetupUrl}">Set your password and activate access</a></p>
    <p>This one-time Firebase link expires automatically. If it has expired or was already used, request a new password-reset link.</p>
  `;

  return { subject, html, text };
}

export function buildApplicationSubmittedTemplate(input: {
  administratorName: string;
  applicantName: string;
  applicantEmail: string;
  programTypeLabel: string;
  researchArea: string;
}): EmailTemplate {
  const subject = `New ${input.programTypeLabel} application submitted`;
  const text = [
    `Dear ${input.administratorName},`,
    "",
    `${input.applicantName} has submitted a new ${input.programTypeLabel} application.`,
    `Applicant email: ${input.applicantEmail}`,
    `Research area: ${input.researchArea}`,
    "Please review the application in the admissions workflow.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.administratorName},</p>
    <p><strong>${input.applicantName}</strong> has submitted a new <strong>${input.programTypeLabel}</strong> application.</p>
    <p><strong>Applicant email:</strong> ${input.applicantEmail}</p>
    <p><strong>Research area:</strong> ${input.researchArea}</p>
    <p>Please review the application in the admissions workflow.</p>
  `;

  return { subject, html, text };
}

export function buildProposalEvaluationSubmittedTemplate(input: {
  administratorName: string;
  supervisorName: string;
  studentName: string;
  proposalTitle: string;
  feedback?: string;
}): EmailTemplate {
  const subject = `Proposal review received: ${input.proposalTitle}`;
  const text = [
    `Dear ${input.administratorName},`,
    "",
    `${input.supervisorName} has submitted a proposal review for ${input.studentName}.`,
    `Proposal title: ${input.proposalTitle}`,
    input.feedback ? `Feedback: ${input.feedback}` : "",
    "You can review the submitted text feedback in the proposal workflow.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.administratorName},</p>
    <p><strong>${input.supervisorName}</strong> has submitted a proposal review for <strong>${input.studentName}</strong>.</p>
    <p><strong>Proposal title:</strong> ${input.proposalTitle}</p>
    ${optionalLabeledParagraph("Feedback", input.feedback)}
    <p>You can review the submitted text feedback in the proposal workflow.</p>
  `;

  return { subject, html, text };
}

export function buildSupervisorAssignmentTemplate(input: {
  supervisorName: string;
  studentName: string;
  assignmentRoleLabel: string;
  assignedByName: string;
}): EmailTemplate {
  const subject = `New supervisor assignment: ${input.assignmentRoleLabel}`;
  const text = [
    `Dear ${input.supervisorName},`,
    "",
    `You have been assigned as ${input.assignmentRoleLabel.toLowerCase()} for ${input.studentName}.`,
    `Assigned by: ${input.assignedByName}`,
    "Please sign in to the Postgraduate Lifecycle Management System to review the student record.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.supervisorName},</p>
    <p>You have been assigned as <strong>${input.assignmentRoleLabel.toLowerCase()}</strong> for <strong>${input.studentName}</strong>.</p>
    <p><strong>Assigned by:</strong> ${input.assignedByName}</p>
    <p>Please sign in to the Postgraduate Lifecycle Management System to review the student record.</p>
  `;

  return { subject, html, text };
}

export function buildExaminerAssignmentTemplate(input: {
  examinerName: string;
  studentName: string;
  thesisTitle: string;
  assignedByName: string;
  secureDownloadUrl: string;
}): EmailTemplate {
  const secureDownloadUrl = validateEmailLink(input.secureDownloadUrl);
  const subject = `New thesis examiner assignment: ${input.thesisTitle}`;
  const text = [
    `Dear ${input.examinerName},`,
    "",
    `You have been assigned as an examiner for ${input.studentName}'s thesis titled "${input.thesisTitle}".`,
    `Assigned by: ${input.assignedByName}`,
    `Secure thesis download link: ${secureDownloadUrl}`,
    "Please review the thesis using the secure link above.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.examinerName},</p>
    <p>You have been assigned as an examiner for <strong>${input.studentName}</strong>'s thesis titled <strong>${input.thesisTitle}</strong>.</p>
    <p><strong>Assigned by:</strong> ${input.assignedByName}</p>
    <p><a href="${secureDownloadUrl}">Open the secure thesis download link</a></p>
    <p>Please review the thesis using the secure link above.</p>
  `;

  return { subject, html, text };
}

export function buildThesisSubmittedTemplate(input: {
  administratorName: string;
  studentName: string;
  thesisTitle: string;
  programTypeLabel: string;
}): EmailTemplate {
  const subject = `New thesis submission: ${input.thesisTitle}`;
  const text = [
    `Dear ${input.administratorName},`,
    "",
    `${input.studentName} has submitted a thesis manuscript for the ${input.programTypeLabel} programme.`,
    `Thesis title: ${input.thesisTitle}`,
    "Please review the submission workflow and proceed with the examination process.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.administratorName},</p>
    <p><strong>${input.studentName}</strong> has submitted a thesis manuscript for the <strong>${input.programTypeLabel}</strong> programme.</p>
    <p><strong>Thesis title:</strong> ${input.thesisTitle}</p>
    <p>Please review the submission workflow and proceed with the examination process.</p>
  `;

  return { subject, html, text };
}

export function buildCorrectionSubmittedTemplate(input: {
  administratorName: string;
  studentName: string;
  thesisTitle: string;
  correctionTypeLabel: string;
}): EmailTemplate {
  const subject = `Correction document submitted: ${input.thesisTitle}`;
  const text = [
    `Dear ${input.administratorName},`,
    "",
    `${input.studentName} has submitted a ${input.correctionTypeLabel.toLowerCase()} correction document for "${input.thesisTitle}".`,
    "Please review the uploaded correction package in the thesis workflow.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.administratorName},</p>
    <p><strong>${input.studentName}</strong> has submitted a <strong>${input.correctionTypeLabel.toLowerCase()}</strong> correction document for <strong>${input.thesisTitle}</strong>.</p>
    <p>Please review the uploaded correction package in the thesis workflow.</p>
  `;

  return { subject, html, text };
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

export async function notifyEthicsApprovalSubmittedToAdministrator(input: {
  recipientUserId: string;
  to: string;
  administratorName: string;
  studentName: string;
  applicationTitle: string;
}) {
  const template = buildEthicsApprovalSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.ETHICS_APPROVAL_SUBMITTED,
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

export async function notifyWelcomeAccountCreated(input: {
  recipientUserId: string;
  to: string;
  recipientName: string;
  roleLabel: string;
  accountSetupUrl: string;
}) {
  const template = buildWelcomeAccountTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyApplicationSubmittedToAdministrator(input: {
  recipientUserId: string;
  to: string;
  administratorName: string;
  applicantName: string;
  applicantEmail: string;
  programTypeLabel: string;
  researchArea: string;
}) {
  const template = buildApplicationSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyProposalEvaluationSubmittedToAdministrator(input: {
  recipientUserId: string;
  to: string;
  administratorName: string;
  supervisorName: string;
  studentName: string;
  proposalTitle: string;
  feedback?: string;
}) {
  const template = buildProposalEvaluationSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.PROPOSAL_STATUS_CHANGED,
    ...template,
  });
}

export async function notifySupervisorAssigned(input: {
  recipientUserId: string;
  to: string;
  supervisorName: string;
  studentName: string;
  assignmentRoleLabel: string;
  assignedByName: string;
}) {
  const template = buildSupervisorAssignmentTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyExaminerAssignedToThesis(input: {
  recipientUserId: string;
  to: string;
  examinerName: string;
  studentName: string;
  thesisTitle: string;
  assignedByName: string;
  secureDownloadUrl: string;
}) {
  const template = buildExaminerAssignmentTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyThesisSubmittedToAdministrator(input: {
  recipientUserId: string;
  to: string;
  administratorName: string;
  studentName: string;
  thesisTitle: string;
  programTypeLabel: string;
}) {
  const template = buildThesisSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

export async function notifyCorrectionSubmittedToAdministrator(input: {
  recipientUserId: string;
  to: string;
  administratorName: string;
  studentName: string;
  thesisTitle: string;
  correctionTypeLabel: string;
}) {
  const template = buildCorrectionSubmittedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.CORRECTIONS_REQUIRED,
    ...template,
  });
}

export function buildVivaScheduledTemplate(input: {
  recipientName: string;
  thesisTitle: string;
  venue: string;
  scheduledDate: Date;
}): EmailTemplate {
  const formattedDate = input.scheduledDate.toLocaleString();
  const subject = `Viva scheduled for thesis: ${input.thesisTitle}`;
  const text = [
    `Dear ${input.recipientName},`,
    "",
    `A viva has been scheduled for the thesis titled "${input.thesisTitle}".`,
    `Date & Time: ${formattedDate}`,
    `Venue: ${input.venue}`,
    "",
    "Please check your dashboard for further details.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.recipientName},</p>
    <p>A viva has been scheduled for the thesis titled <strong>${input.thesisTitle}</strong>.</p>
    <p><strong>Date & Time:</strong> ${formattedDate}</p>
    <p><strong>Venue:</strong> ${input.venue}</p>
    <p>Please check your dashboard for further details.</p>
  `;

  return { subject, html, text };
}

export async function notifyVivaScheduled(input: {
  recipientUserId: string;
  to: string;
  recipientName: string;
  thesisTitle: string;
  venue: string;
  scheduledDate: Date;
}) {
  const template = buildVivaScheduledTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.VIVA_SCHEDULED,
    ...template,
  });
}

// ---------------------------------------------------------------------------
// Application status changed
// ---------------------------------------------------------------------------

export function buildApplicationStatusChangedTemplate(input: {
  studentName: string;
  newStatus: string;
  programTypeLabel: string;
}): EmailTemplate {
  const subject = `Your ${input.programTypeLabel} application status has been updated`;
  const text = [
    `Dear ${input.studentName},`,
    "",
    `The status of your ${input.programTypeLabel} application has been updated to: ${input.newStatus}.`,
    "Please sign in to the system to view further details.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.studentName},</p>
    <p>The status of your <strong>${input.programTypeLabel}</strong> application has been updated to: <strong>${input.newStatus}</strong>.</p>
    <p>Please sign in to the system to view further details.</p>
  `;

  return { subject, html, text };
}

export async function notifyApplicationStatusChanged(input: {
  recipientUserId: string;
  to: string;
  studentName: string;
  newStatus: string;
  programTypeLabel: string;
}) {
  const template = buildApplicationStatusChangedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.APPLICATION_STATUS_CHANGED,
    ...template,
  });
}

// ---------------------------------------------------------------------------
// Thesis archived
// ---------------------------------------------------------------------------

export function buildThesisArchivedTemplate(input: {
  studentName: string;
  thesisTitle: string;
}): EmailTemplate {
  const subject = `Your thesis has been archived: ${input.thesisTitle}`;
  const text = [
    `Dear ${input.studentName},`,
    "",
    `Your thesis titled "${input.thesisTitle}" has been successfully archived in the Postgraduate Lifecycle Management System.`,
    "No further action is required. Congratulations on completing your programme.",
  ].join("\n");
  const html = emailHtml`
    <p>Dear ${input.studentName},</p>
    <p>Your thesis titled <strong>${input.thesisTitle}</strong> has been successfully archived in the Postgraduate Lifecycle Management System.</p>
    <p>No further action is required. Congratulations on completing your programme.</p>
  `;

  return { subject, html, text };
}

export async function notifyThesisArchived(input: {
  recipientUserId: string;
  to: string;
  studentName: string;
  thesisTitle: string;
}) {
  const template = buildThesisArchivedTemplate(input);

  return sendEmail({
    to: input.to,
    recipientUserId: input.recipientUserId,
    event: NotificationEvent.THESIS_ARCHIVED,
    ...template,
  });
}
