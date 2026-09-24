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
  notifyProposalStatusChange,
  resetEmailTransporterForTests,
  sendEmailInBackground,
} from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

describe("email workflow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailTransporterForTests();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "PGSMS <mailer@example.com>";
  });

  it("creates a NotificationLog entry automatically for a proposal status workflow", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-2" });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    await notifyProposalStatusChange({
      recipientUserId: "student-user-1",
      to: "student@example.com",
      studentName: "Student One",
      proposalTitle: "AI for Education",
      statusLabel: "APPROVED",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "student-user-1",
          event: "PROPOSAL_STATUS_CHANGED",
          deliveryStatus: "SENT",
        }),
      }),
    );
  });

  it("handles asynchronous execution without blocking the caller", async () => {
    let resolveSendMail: ((value: { messageId: string }) => void) | undefined;
    const sendMail = vi.fn(
      () =>
        new Promise<{ messageId: string }>((resolve) => {
          resolveSendMail = resolve;
        }),
    );
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    vi.mocked(prisma.notificationLog.create).mockResolvedValue({} as never);

    const backgroundPromise = sendEmailInBackground({
      to: "student@example.com",
      subject: "Progress report submitted",
      html: "<p>Submitted</p>",
      text: "Submitted",
      recipientUserId: "supervisor-user-1",
      event: "PROGRESS_REPORT_SUBMITTED",
    });

    await Promise.resolve();

    expect(sendMail).toHaveBeenCalledTimes(1);

    resolveSendMail?.({ messageId: "message-3" });
    await backgroundPromise;

    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "supervisor-user-1",
          deliveryStatus: "SENT",
        }),
      }),
    );
  });
});
