import { NotificationEvent } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be defined BEFORE imports that use them (vi.mock hoisting)
// ---------------------------------------------------------------------------

vi.mock("@/lib/email", () => ({
  notifyApplicationStatusChanged: vi.fn().mockResolvedValue({ success: true }),
  notifyProposalStatusChange: vi.fn().mockResolvedValue({ success: true }),
  notifyEthicsApprovalSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
  notifyProposalEvaluationSubmittedToAdministrator: vi.fn().mockResolvedValue({ success: true }),
  notifyProgressReportSubmitted: vi.fn().mockResolvedValue({ success: true }),
  notifyThesisArchived: vi.fn().mockResolvedValue({ success: true }),
  notifyVivaScheduled: vi.fn().mockResolvedValue({ success: true }),
  notifyCorrectionSubmittedToAdministrator: vi.fn().mockResolvedValue({
    success: true,
  }),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notif-1" }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { notify } from "@/lib/notifications";
import {
  notifyApplicationStatusChanged,
  notifyProgressReportSubmitted,
  notifyProposalEvaluationSubmittedToAdministrator,
  notifyProposalStatusChange,
  notifyEthicsApprovalSubmittedToAdministrator,
  notifyThesisArchived,
  notifyVivaScheduled,
  notifyCorrectionSubmittedToAdministrator,
} from "@/lib/email";
import { prisma } from "@/lib/prisma/client";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NotificationService — event-to-template mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches APPLICATION_STATUS_CHANGED to correct email function", async () => {
    await notify({
      event: "APPLICATION_STATUS_CHANGED",
      recipientUserId: "user-1",
      to: "student@example.com",
      studentName: "Alice",
      newStatus: "ADMITTED",
      programTypeLabel: "MPhil",
    });

    expect(notifyApplicationStatusChanged).toHaveBeenCalledOnce();
    expect(notifyApplicationStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: "ADMITTED" }),
    );
  });

  it("dispatches PROPOSAL_STATUS_CHANGED to correct email function", async () => {
    await notify({
      event: "PROPOSAL_STATUS_CHANGED",
      recipientUserId: "user-1",
      to: "student@example.com",
      studentName: "Alice",
      proposalTitle: "AI Ethics",
      statusLabel: "APPROVED",
    });

    expect(notifyProposalStatusChange).toHaveBeenCalledOnce();
    expect(notifyProposalStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ proposalTitle: "AI Ethics", statusLabel: "APPROVED" }),
    );
  });

  it("dispatches PROGRESS_REPORT_SUBMITTED to supervisor email function (REQ-FN-019)", async () => {
    await notify({
      event: "PROGRESS_REPORT_SUBMITTED",
      recipientUserId: "supervisor-user-1",
      to: "supervisor@example.com",
      supervisorName: "Dr. Smith",
      studentName: "Alice",
      studentId: "student-1",
      periodLabel: "Q1 2026",
    });

    expect(notifyProgressReportSubmitted).toHaveBeenCalledOnce();
    expect(notifyProgressReportSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        supervisorName: "Dr. Smith",
        periodLabel: "Q1 2026",
      }),
    );
  });

  it("dispatches ETHICS_APPROVAL_SUBMITTED to administrators", async () => {
    await notify({
      event: "ETHICS_APPROVAL_SUBMITTED",
      recipientUserId: "admin-user-1",
      to: "admin@example.com",
      administratorName: "Admin One",
      studentName: "Alice",
      studentId: "student-1",
      applicationTitle: "Interview ethics",
    });

    expect(notifyEthicsApprovalSubmittedToAdministrator).toHaveBeenCalledOnce();
    expect(notifyEthicsApprovalSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        administratorName: "Admin One",
        applicationTitle: "Interview ethics",
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "admin-user-1",
          studentId: "student-1",
          event: NotificationEvent.ETHICS_APPROVAL_SUBMITTED,
        }),
      }),
    );
  });

  it("dispatches EXAMINER_REVIEW_SUBMITTED to administrators", async () => {
    await notify({
      event: "EXAMINER_REVIEW_SUBMITTED",
      recipientUserId: "admin-user-1",
      to: "admin@example.com",
      administratorName: "Admin One",
      examinerName: "Examiner One",
      studentName: "Alice",
      studentId: "student-1",
      subjectTitle: "AI Ethics",
      reviewKind: "proposal",
      feedback: "Text review is available.",
    });

    expect(notifyProposalEvaluationSubmittedToAdministrator).toHaveBeenCalledOnce();
    expect(notifyProposalEvaluationSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        administratorName: "Admin One",
        supervisorName: "Examiner One",
        proposalTitle: "AI Ethics",
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "admin-user-1",
          studentId: "student-1",
          event: NotificationEvent.EXAMINER_REVIEW_SUBMITTED,
        }),
      }),
    );
  });

  it("dispatches THESIS_ARCHIVED to correct email function", async () => {
    await notify({
      event: "THESIS_ARCHIVED",
      recipientUserId: "user-1",
      to: "student@example.com",
      studentName: "Alice",
      thesisTitle: "AI Governance in Sri Lanka",
    });

    expect(notifyThesisArchived).toHaveBeenCalledOnce();
    expect(notifyThesisArchived).toHaveBeenCalledWith(
      expect.objectContaining({ thesisTitle: "AI Governance in Sri Lanka" }),
    );
  });

  it("dispatches VIVA_SCHEDULED to the central email and in-app paths", async () => {
    const scheduledDate = new Date("2026-10-10T10:00:00.000Z");

    await notify({
      event: "VIVA_SCHEDULED",
      recipientUserId: "examiner-user-1",
      to: "examiner@example.com",
      recipientName: "Examiner One",
      thesisTitle: "AI Governance in Sri Lanka",
      venue: "Main Hall",
      scheduledDate,
    });

    expect(notifyVivaScheduled).toHaveBeenCalledOnce();
    expect(notifyVivaScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: "Examiner One",
        venue: "Main Hall",
        scheduledDate,
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "examiner-user-1",
          event: NotificationEvent.VIVA_SCHEDULED,
        }),
      }),
    );
  });

  it("dispatches CORRECTIONS_REQUIRED to the central email and in-app paths", async () => {
    await notify({
      event: "CORRECTIONS_REQUIRED",
      recipientUserId: "admin-user-1",
      to: "admin@example.com",
      administratorName: "Admin One",
      studentName: "Alice",
      thesisTitle: "AI Governance in Sri Lanka",
      correctionTypeLabel: "Minor",
    });

    expect(notifyCorrectionSubmittedToAdministrator).toHaveBeenCalledOnce();
    expect(notifyCorrectionSubmittedToAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({
        administratorName: "Admin One",
        studentName: "Alice",
        correctionTypeLabel: "Minor",
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientId: "admin-user-1",
          event: NotificationEvent.CORRECTIONS_REQUIRED,
        }),
      }),
    );
  });

  it("writes an in-app Notification record for every dispatched event", async () => {
    await notify({
      event: "THESIS_ARCHIVED",
      recipientUserId: "user-1",
      to: "student@example.com",
      studentName: "Alice",
      thesisTitle: "AI Governance in Sri Lanka",
    });

    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: NotificationEvent.THESIS_ARCHIVED,
          recipientId: "user-1",
        }),
      }),
    );
  });
});

describe("NotificationService — SMTP failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when SMTP delivery fails — still writes in-app notification", async () => {
    vi.mocked(notifyProgressReportSubmitted).mockResolvedValueOnce({
      success: false,
      error: "ECONNREFUSED",
    });

    await expect(
      notify({
        event: "PROGRESS_REPORT_SUBMITTED",
        recipientUserId: "supervisor-user-1",
        to: "supervisor@example.com",
        supervisorName: "Dr. Smith",
        studentName: "Alice",
        studentId: "student-1",
        periodLabel: "Q1 2026",
      }),
    ).resolves.toBeUndefined();

    // The in-app notification should still have been attempted
    expect(prisma.notification.create).toHaveBeenCalledOnce();
  });
});
