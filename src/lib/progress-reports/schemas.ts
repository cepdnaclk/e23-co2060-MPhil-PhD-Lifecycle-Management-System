import { z } from "zod";

import { stagedUploadFileSchema } from "@/lib/uploads/schemas";
import { sanitizedString } from "@/lib/validation/schemas";

export const progressReportDocumentSchema = stagedUploadFileSchema;

export const progressReportUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(progressReportDocumentSchema)
    .min(1, "Upload at least one progress report document.")
    .max(10, "Upload no more than 10 progress report documents."),
});

export const progressReportSubmissionSchema = z.object({
  periodLabel: sanitizedString.min(1, "Period label is required."),
  narrative: sanitizedString.min(1, "Narrative is required."),
  uploadSessionId: z
    .string()
    .uuid("A valid upload session ID is required.")
    .optional(),
});

export type ProgressReportSubmissionInput = z.infer<
  typeof progressReportSubmissionSchema
>;
export type ProgressReportDocumentInput = z.infer<
  typeof progressReportDocumentSchema
>;
export type ProgressReportUploadRequest = z.infer<
  typeof progressReportUploadRequestSchema
>;
