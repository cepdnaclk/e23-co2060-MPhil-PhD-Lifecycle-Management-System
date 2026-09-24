import {
  AssignmentStatus,
  DepartmentDecision,
  SupervisorConsentStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import {
  assignProposalReviewer,
  recordHodAdmissionDecision,
  recordProposedSupervisorConsent,
  submitAssignedProposalReview,
} from "@/lib/applications/department-workflow";
import { prisma } from "@/lib/prisma/client";

const supervisorAuth = {
  uid: "firebase-supervisor-1",
  firebaseUid: "firebase-supervisor-1",
  userId: "supervisor-user-1",
  role: UserRole.SUPERVISOR,
} as const;

const examinerAuth = {
  uid: "firebase-examiner-1",
  firebaseUid: "firebase-examiner-1",
  userId: "reviewer-user-2",
  role: UserRole.EXAMINER,
} as const;

const hodAuth = {
  uid: "firebase-hod",
  firebaseUid: "firebase-hod",
  userId: "hod-user-1",
  role: UserRole.HOD,
} as const;

describe("Department application workflow boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects consent from anyone except the named proposed supervisor", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            proposedSupervisorUserId: "another-supervisor",
            supervisorConsentStatus: SupervisorConsentStatus.PENDING,
          }),
        },
      } as never),
    );

    await expect(
      recordProposedSupervisorConsent(
        "application-1",
        SupervisorConsentStatus.CONSENTED,
        supervisorAuth,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This consent request is assigned to another supervisor.",
    });
  });

  it("rejects a review submission from an unassigned user", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        proposalReviewerAssignment: {
          findUnique: vi.fn().mockResolvedValue({
            id: "assignment-1",
            reviewerUserId: "reviewer-user-1",
            proposalVersionId: "version-1",
            status: AssignmentStatus.PENDING,
          }),
        },
      } as never),
    );

    await expect(
      submitAssignedProposalReview(
        "assignment-1",
        {
          decision: DepartmentDecision.APPROVED,
          comments: "The proposal is suitable for Department approval.",
        },
        examinerAuth,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This proposal review is assigned to another user.",
    });
  });

  it("requires supervisor consent before an HOD decision", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            departmentDecision: DepartmentDecision.PENDING,
            supervisorConsentStatus: SupervisorConsentStatus.PENDING,
          }),
        },
      } as never),
    );

    await expect(
      recordHodAdmissionDecision(
        "application-1",
        {
          decision: DepartmentDecision.APPROVED,
          reason: "The application satisfies all Department requirements.",
        },
        hodAuth,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Supervisor consent is incomplete.",
    });
  });

  it("allows only active Examiners to be assigned as proposal reviewers", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            supervisorConsentStatus: SupervisorConsentStatus.CONSENTED,
            proposalVersions: [{ id: "version-1", title: "Proposal" }],
          }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "supervisor-user-1",
            role: UserRole.SUPERVISOR,
            isActive: true,
          }),
        },
      } as never),
    );

    await expect(
      assignProposalReviewer("application-1", "supervisor-user-1", {
        uid: "firebase-admin",
        firebaseUid: "firebase-admin",
        userId: "admin-user-1",
        role: UserRole.ADMINISTRATOR,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Reviewer must be an active Examiner.",
    });
  });

  it("requires at least one current Examiner proposal review before an HOD decision", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            departmentDecision: DepartmentDecision.PENDING,
            supervisorConsentStatus: SupervisorConsentStatus.CONSENTED,
            proposalReviewerAssignments: [],
          }),
        },
      } as never),
    );

    await expect(
      recordHodAdmissionDecision(
        "application-1",
        {
          decision: DepartmentDecision.APPROVED,
          reason: "The application satisfies all Department requirements.",
        },
        hodAuth,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "At least one completed Examiner proposal review is required.",
    });
  });

  it("requires every current Examiner proposal review to be completed", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            departmentDecision: DepartmentDecision.PENDING,
            supervisorConsentStatus: SupervisorConsentStatus.CONSENTED,
            proposalReviewerAssignments: [
              {
                status: AssignmentStatus.PENDING,
                reviewer: { role: UserRole.EXAMINER },
                review: null,
              },
            ],
          }),
        },
      } as never),
    );

    await expect(
      recordHodAdmissionDecision(
        "application-1",
        {
          decision: DepartmentDecision.REJECTED,
          reason: "The proposal review must be completed before this decision.",
        },
        hodAuth,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "All current proposal reviews must be completed before a Department decision.",
    });
  });

  it("queues a deliverable guest email when completed reviews request a revision", async () => {
    const createOutbox = vi.fn().mockResolvedValue({ id: "outbox-1" });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            applicantName: "Applicant One",
            applicantEmail: "applicant@example.com",
            departmentDecision: DepartmentDecision.PENDING,
            supervisorConsentStatus: SupervisorConsentStatus.CONSENTED,
            proposalReviewerAssignments: [
              {
                status: AssignmentStatus.COMPLETED,
                reviewer: { role: UserRole.EXAMINER },
                review: { id: "review-1" },
              },
            ],
          }),
          update: vi.fn().mockResolvedValue({
            id: "application-1",
            departmentDecision: DepartmentDecision.REVISION_REQUIRED,
          }),
        },
        lifecycleAuditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
        outboxMessage: { create: createOutbox },
      } as never),
    );

    await recordHodAdmissionDecision(
      "application-1",
      {
        decision: DepartmentDecision.REVISION_REQUIRED,
        reason: "Please revise the research methodology and resubmit the proposal.",
      },
      hodAuth,
    );

    expect(createOutbox).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: null,
        notificationEvent: null,
        payload: {
          email: expect.objectContaining({
            to: "applicant@example.com",
            subject: "PGLMS proposal revision requested",
          }),
        },
      }),
    });
  });
});
