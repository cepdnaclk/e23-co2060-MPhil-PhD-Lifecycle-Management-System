import { CorrectionType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  createSessionRequestSchema,
  loginCredentialsSchema,
  syncFirebaseClaimsRequestSchema,
} from "@/lib/auth/schemas";
import { progressReportSubmissionSchema } from "@/lib/progress-reports/schemas";
import {
  correctionSubmissionSchema,
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

  it("rejects invalid Firebase claims sync payloads", () => {
    const result = syncFirebaseClaimsRequestSchema.safeParse({
      userId: "user-1",
      firebaseUid: "",
      role: "INVALID_ROLE",
    });

    expect(result.success).toBe(false);
  });

  it("trims and validates progress report submissions", () => {
    const result = progressReportSubmissionSchema.safeParse({
      periodLabel: "   2026 Q1   ",
      narrative:
        "This narrative easily exceeds one hundred characters so it should pass once the surrounding whitespace is normalized.",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.periodLabel).toBe("2026 Q1");
    }
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
    const result = correctionSubmissionSchema.safeParse({
      correctionType: CorrectionType.MINOR,
      description: "Updated the requested sections.",
      document: {
        fileName: "",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
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
