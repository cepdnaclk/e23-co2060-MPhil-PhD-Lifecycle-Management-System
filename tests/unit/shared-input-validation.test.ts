import { describe, expect, it } from "vitest";

import {
  createSessionRequestSchema,
  loginCredentialsSchema,
} from "@/lib/auth/schemas";
import { progressReportUploadRequestSchema } from "@/lib/progress-reports/schemas";
import {
  orderedCorrectionSubmissionSchema,
  thesisSubmissionSchema,
} from "@/lib/theses/schemas";
import { scheduleVivaSchema } from "@/lib/vivas/schemas";

describe("shared input validation schemas", () => {
  it("rejects invalid login credentials", () => {
    const result = loginCredentialsSchema.safeParse({
      email: "invalid-email",
      password: "short",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty Firebase session request token", () => {
    const result = createSessionRequestSchema.safeParse({
      idToken: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("requires sealed evidence metadata instead of a free-text progress period", () => {
    const result = progressReportUploadRequestSchema.safeParse({
      idempotencyKey: "70fdd15a-f5e4-435b-983d-c65db72ab2b0",
      files: [
        {
          fileName: "milestone.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1_024,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-PDF thesis uploads", () => {
    const result = thesisSubmissionSchema.safeParse({
      title: "Thesis Title",
      abstract: "A concise abstract.",
      document: {
        fileName: "thesis.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1024,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid correction uploads", () => {
    const result = orderedCorrectionSubmissionSchema.safeParse({
      responseSummary: "Too short",
      uploadSessionId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rejects viva schedules in the past", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const result = scheduleVivaSchema.safeParse({
      thesisId: "thesis-1",
      venue: "Room 101",
      scheduledDate: pastDate.toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
