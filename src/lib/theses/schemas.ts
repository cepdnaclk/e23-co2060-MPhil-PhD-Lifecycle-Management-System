import { CorrectionType } from "@prisma/client";
import { z } from "zod";

import {
  stagedUploadFileSchema,
} from "@/lib/uploads/schemas";
import { optionalSanitizedString, sanitizedString } from "@/lib/validation/schemas";

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

export const correctionSubmissionSchema = z.object({
  correctionType: z.nativeEnum(CorrectionType),
  description: optionalSanitizedString,
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
});

export type ThesisSubmissionInput = z.infer<typeof thesisSubmissionSchema>;
export type ThesisUploadRequest = z.infer<typeof thesisUploadRequestSchema>;
export type CorrectionUploadRequest = z.infer<typeof correctionUploadRequestSchema>;
export type CorrectionSubmissionInput = z.infer<typeof correctionSubmissionSchema>;
