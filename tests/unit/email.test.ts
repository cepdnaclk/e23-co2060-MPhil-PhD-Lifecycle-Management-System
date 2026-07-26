import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    notificationLog: {
      create: vi.fn(),
    },
  },
}));

import nodemailer from "nodemailer";

import {
  buildExaminerAssignmentTemplate,
  buildProposalStatusChangeTemplate,
  buildWelcomeAccountTemplate,
  resetEmailTransporterForTests,
  sendEmail,
} from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailTransporterForTests();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "PGLMS <mailer@example.com>";
  });

  it("sends email with the correct recipient and subject", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-1" });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    const result = await sendEmail({
      to: "student@example.com",
      subject: "Proposal status updated",
      html: "<p>Hello</p>",
      text: "Hello",
      recipientUserId: "user-1",
      event: "PROPOSAL_STATUS_CHANGED",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "student@example.com",
        subject: "Proposal status updated",
      }),
    );
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "user-1",
          subject: "Proposal status updated",
          deliveryStatus: "SENT",
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("writes FAILED to NotificationLog when the SMTP transporter throws", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP unavailable"));
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    const result = await sendEmail({
      to: "student@example.com",
      subject: "Historical system notice",
      html: "<p>Hello</p>",
      text: "Hello",
      recipientUserId: "user-2",
      event: "SYSTEM_NOTICE",
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "user-2",
          deliveryStatus: "FAILED",
          failureReason: "SMTP unavailable",
        }),
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("SMTP unavailable");
  });

  it("writes FAILED to NotificationLog when SMTP configuration is missing", async () => {
    delete process.env.SMTP_HOST;
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    const result = await sendEmail({
      to: "student@example.com",
      subject: "Historical system notice",
      html: "<p>Hello</p>",
      text: "Hello",
      recipientUserId: "user-2",
      event: "SYSTEM_NOTICE",
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "user-2",
          deliveryStatus: "FAILED",
          failureReason:
            "Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.",
        }),
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.",
    );
  });

  it("removes line breaks from email subjects before sending and logging", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-2" });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    await sendEmail({
      to: "student@example.com",
      subject: "Expected subject\r\nBcc: attacker@example.com",
      html: "<p>Hello</p>",
      text: "Hello",
      recipientUserId: "user-3",
      event: "PROPOSAL_STATUS_CHANGED",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Expected subject Bcc: attacker@example.com",
      }),
    );
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: "Expected subject Bcc: attacker@example.com",
        }),
      }),
    );
  });
});

describe("email template safety", () => {
  it("escapes user-controlled HTML in proposal notifications", () => {
    const template = buildProposalStatusChangeTemplate({
      studentName: '<img src=x onerror="alert(1)">',
      proposalTitle: "<script>alert(1)</script>",
      statusLabel: "APPROVED",
      feedback: "<b>unsafe feedback</b>",
    });

    expect(template.html).not.toContain("<script>");
    expect(template.html).not.toContain("<img");
    expect(template.html).not.toContain("<b>unsafe");
    expect(template.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(template.html).toContain("&lt;b&gt;unsafe feedback&lt;/b&gt;");
  });

  it("uses a validated one-time setup link without exposing a password", () => {
    const template = buildWelcomeAccountTemplate({
      recipientName: "New User",
      roleLabel: "SUPERVISOR",
      accountSetupUrl:
        "https://identity.example/action?mode=resetPassword&oobCode=one-time",
    });

    expect(template.html).toContain(
      "https://identity.example/action?mode=resetPassword&amp;oobCode=one-time",
    );
    expect(template.text).toContain("Set your password:");
    expect(template.text.toLowerCase()).not.toContain("temporary password");
  });

  it("rejects executable or credential-bearing links in templates", () => {
    expect(() =>
      buildWelcomeAccountTemplate({
        recipientName: "New User",
        roleLabel: "EXAMINER",
        accountSetupUrl: "javascript:alert(1)",
      }),
    ).toThrow("Email links must use an HTTP(S) URL without credentials.");

    expect(() =>
      buildExaminerAssignmentTemplate({
        examinerName: "Examiner",
        studentName: "Student",
        thesisTitle: "Thesis",
        assignedByName: "Administrator",
        secureDownloadUrl: "https://user:password@example.com/thesis.pdf",
      }),
    ).toThrow("Email links must use an HTTP(S) URL without credentials.");
  });
});
