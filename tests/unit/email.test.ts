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
    process.env.SMTP_FROM = "PGSMS <mailer@example.com>";
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
      subject: "Registration expiry reminder",
      html: "<p>Hello</p>",
      text: "Hello",
      recipientUserId: "user-2",
      event: "REGISTRATION_EXPIRY_APPROACHING",
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
});
