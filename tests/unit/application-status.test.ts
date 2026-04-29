import { ApplicationStatus } from "@prisma/client";

import { assertValidApplicationStatusTransition } from "@/lib/prisma/application-status";

describe("assertValidApplicationStatusTransition", () => {
  it("allows SUBMITTED to UNDER_REVIEW", () => {
    expect(() => {
      assertValidApplicationStatusTransition(
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.UNDER_REVIEW,
      );
    }).not.toThrow();
  });

  it("throws for ADMITTED to SUBMITTED", () => {
    expect(() => {
      assertValidApplicationStatusTransition(
        ApplicationStatus.ADMITTED,
        ApplicationStatus.SUBMITTED,
      );
    }).toThrow("Invalid application status transition");
  });

  it("throws for REJECTED to UNDER_REVIEW", () => {
    expect(() => {
      assertValidApplicationStatusTransition(
        ApplicationStatus.REJECTED,
        ApplicationStatus.UNDER_REVIEW,
      );
    }).toThrow("Invalid application status transition");
  });
});
