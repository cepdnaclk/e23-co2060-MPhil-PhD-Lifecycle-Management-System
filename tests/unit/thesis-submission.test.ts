import { ThesisStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assertValidThesisStatusTransition } from "@/lib/prisma/thesis-status";
import {
  thesisSubmissionSchema,
  thesisUploadRequestSchema,
} from "@/lib/theses/schemas";

describe("thesis submission contracts", () => {
  it("accepts a multi-file staged upload request", () => {
    const parsed = thesisUploadRequestSchema.safeParse({
      idempotencyKey: "d6da5510-657f-4d9b-a3d8-56d67e4f52dd",
      files: [
        {
          fileName: "thesis.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        {
          fileName: "appendix.zip",
          mimeType: "application/zip",
          sizeBytes: 2048,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires finalization to reference a staged upload session", () => {
    const parsed = thesisSubmissionSchema.safeParse({
      title: "Adaptive Systems Thesis",
      abstract: "A thesis about adaptive systems.",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid thesis status transition", () => {
    expect(() =>
      assertValidThesisStatusTransition(
        ThesisStatus.SUBMITTED,
        ThesisStatus.ARCHIVED,
      ),
    ).toThrow("Invalid thesis status transition: SUBMITTED -> ARCHIVED");
  });

  it("prevents ordinary thesis resubmission from bypassing corrections", () => {
    expect(() =>
      assertValidThesisStatusTransition(
        ThesisStatus.CORRECTIONS_REQUIRED,
        ThesisStatus.SUBMITTED,
      ),
    ).toThrow(
      "Invalid thesis status transition: CORRECTIONS_REQUIRED -> SUBMITTED",
    );

    expect(() =>
      assertValidThesisStatusTransition(
        ThesisStatus.CORRECTIONS_REQUIRED,
        ThesisStatus.CORRECTIONS_APPROVED,
      ),
    ).not.toThrow();
  });
});
