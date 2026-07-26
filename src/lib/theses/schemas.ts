import { z } from "zod";

import {
  stagedUploadFileSchema,
} from "@/lib/uploads/schemas";
import { sanitizedString } from "@/lib/validation/schemas";

export const uploadedThesisDocumentSchema = stagedUploadFileSchema;

export const uploadedPdfDocumentSchema = uploadedThesisDocumentSchema;

export const thesisUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(uploadedThesisDocumentSchema)
    .min(1, "Upload at least one thesis document.")
    .max(10, "Upload no more than 10 thesis documents in one version."),
});

export const thesisSubmissionSchema = z.object({
  title: sanitizedString.min(1, "Thesis title is required."),
  abstract: sanitizedString.min(1, "Thesis abstract is required."),
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
});

export const correctionUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(uploadedThesisDocumentSchema)
    .min(1, "Upload at least one correction document.")
    .max(10, "Upload no more than 10 correction documents."),
});

export const orderedCorrectionSubmissionSchema = z.object({
  responseSummary: sanitizedString
    .min(20, "Explain how the ordered corrections were addressed.")
    .max(10_000),
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
});

export type ThesisSubmissionInput = z.infer<typeof thesisSubmissionSchema>;
export type ThesisUploadRequest = z.infer<typeof thesisUploadRequestSchema>;
export type CorrectionUploadRequest = z.infer<typeof correctionUploadRequestSchema>;
export type OrderedCorrectionSubmissionInput = z.infer<
  typeof orderedCorrectionSubmissionSchema
>;
