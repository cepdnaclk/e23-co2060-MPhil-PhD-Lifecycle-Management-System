import { ProgramType } from "@prisma/client";
import { z } from "zod";

import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_APPLICATION_UPLOAD_SIZE_BYTES,
} from "@/lib/validation/uploads";
import {
  sanitizedEmail,
  sanitizedString,
} from "@/lib/validation/schemas";

export const APPLICATION_ATTACHMENT_MAX_SIZE_BYTES =
  MAX_APPLICATION_UPLOAD_SIZE_BYTES;

export const applicationProgramTypes = [
  ProgramType.MPHIL,
  ProgramType.PHD,
] as const;

const uploadedApplicationDocumentSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(APPLICATION_ATTACHMENT_MAX_SIZE_BYTES),
});

export const applicationDocumentDeleteRequestSchema = z.object({
  draftId: sanitizedString.min(1, "A draft id is required."),
  draftToken: sanitizedString.min(32, "A draft capability token is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
});

export const applicationSubmissionSchema = z.object({
  draftId: z.string().uuid("A valid application draft ID is required."),
  draftToken: sanitizedString.min(32, "A draft capability token is required."),
  applicantName: sanitizedString.min(3, "Applicant name must be at least 3 characters long."),
  applicantEmail: sanitizedEmail,
  applicantPhone: sanitizedString
    .regex(/^\+?[0-9\s\-()]+$/, "Phone number can only contain digits, spaces, hyphens, and parentheses.")
    .refine((val) => {
      const digitCount = val.replace(/\D/g, "").length;
      return digitCount >= 7 && digitCount <= 15;
    }, "Phone number must contain between 7 and 15 digits."),
  programType: z.enum([
    ProgramType.MPHIL,
    ProgramType.PHD,
  ]),
  supervisor: sanitizedString.max(200).optional().nullable(),
  researchArea: sanitizedString.min(2, "Research area must be at least 2 characters long."),
  statementOfPurpose: sanitizedString.min(1, "Provide a short statement of purpose."),
  supportingDocuments: z
    .array(uploadedApplicationDocumentSchema)
    .min(1, "Upload a supporting document.")
    .max(10, "Upload at most 10 supporting documents."),
});

export const applicationUploadRequestSchema = z.object({
  draftId: z.string().uuid("A valid application draft ID is required."),
  draftToken: sanitizedString.min(32, "A draft capability token is required."),
  fileName: sanitizedString.min(1, "A file name is required."),
  contentType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  fileSizeBytes: z.number().int().positive().max(APPLICATION_ATTACHMENT_MAX_SIZE_BYTES),
});

export type ApplicationSubmissionInput = z.infer<typeof applicationSubmissionSchema>;
export type ApplicationUploadRequest = z.infer<typeof applicationUploadRequestSchema>;
export type ApplicationDocumentDeleteRequest = z.infer<
  typeof applicationDocumentDeleteRequestSchema
>;
