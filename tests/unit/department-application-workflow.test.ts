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
        supervisorAuth,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This proposal review is assigned to another user.",
    });
  });

  it("requires two completed current-version reviews before an HOD decision", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: "application-1",
            departmentDecision: DepartmentDecision.PENDING,
            supervisorConsentStatus: SupervisorConsentStatus.CONSENTED,
            proposalReviewerAssignments: [
              { status: AssignmentStatus.COMPLETED },
            ],
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
        {
          uid: "firebase-hod",
          firebaseUid: "firebase-hod",
          userId: "hod-user-1",
          role: UserRole.HOD,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Two completed reviews of the current proposal version are required.",
    });
  });
});
