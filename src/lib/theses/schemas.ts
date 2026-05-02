import { CorrectionType } from "@prisma/client";
import { z } from "zod";

import { MAX_STORAGE_FILE_SIZE_BYTES } from "@/lib/validation/uploads";
import { optionalSanitizedString, sanitizedString } from "@/lib/validation/schemas";

export const uploadedPdfDocumentSchema = z.object({
  fileName: sanitizedString.min(1, "Document file name is required."),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const thesisSubmissionSchema = z.object({
  title: sanitizedString.min(1, "Thesis title is required."),
  abstract: sanitizedString.min(1, "Thesis abstract is required."),
  document: uploadedPdfDocumentSchema,
});

export const correctionSubmissionSchema = z.object({
  correctionType: z.nativeEnum(CorrectionType),
  description: optionalSanitizedString,
  document: uploadedPdfDocumentSchema,
});

export type ThesisSubmissionInput = z.infer<typeof thesisSubmissionSchema>;
export type CorrectionSubmissionInput = z.infer<typeof correctionSubmissionSchema>;
