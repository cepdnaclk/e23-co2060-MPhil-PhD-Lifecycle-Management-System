import { ProgramType } from "@prisma/client";
import { z } from "zod";

import { MAX_APPLICATION_UPLOAD_SIZE_BYTES } from "@/lib/validation/uploads";
import {
  sanitizedEmail,
  sanitizedString,
} from "@/lib/validation/schemas";

export const APPLICATION_ATTACHMENT_MAX_SIZE_BYTES =
  MAX_APPLICATION_UPLOAD_SIZE_BYTES;

export const applicationProgramTypes = [
  ProgramType.MPHIL,
  ProgramType.PHD,
  ProgramType.MSC,
  ProgramType.MENG,
] as const;

const uploadedApplicationDocumentSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(APPLICATION_ATTACHMENT_MAX_SIZE_BYTES),
});

export const applicationDocumentDeleteRequestSchema = z.object({
  draftId: sanitizedString.min(1, "A draft id is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
});

export const applicationSubmissionSchema = z.object({
  applicantName: sanitizedString.min(3, "Enter the applicant name."),
  applicantEmail: sanitizedEmail,
  applicantPhone: sanitizedString.min(7, "Enter a valid contact number."),
  programType: z.enum([
    ProgramType.MPHIL,
    ProgramType.PHD,
    ProgramType.MSC,
    ProgramType.MENG,
  ]),
  researchArea: sanitizedString.min(2, "Enter the research area."),
  statementOfPurpose: sanitizedString.min(1, "Provide a short statement of purpose."),
  supportingDocuments: z
    .array(uploadedApplicationDocumentSchema)
    .min(1, "Upload a supporting document.")
    .max(1, "Upload only one supporting document."),
});

export const applicationUploadRequestSchema = z.object({
  draftId: sanitizedString.min(1, "A draft id is required."),
  fileName: sanitizedString.min(1, "A file name is required."),
  contentType: z.literal("application/pdf"),
  fileSizeBytes: z.number().int().positive().max(APPLICATION_ATTACHMENT_MAX_SIZE_BYTES),
});

export type ApplicationSubmissionInput = z.infer<typeof applicationSubmissionSchema>;
export type ApplicationUploadRequest = z.infer<typeof applicationUploadRequestSchema>;
export type ApplicationDocumentDeleteRequest = z.infer<
  typeof applicationDocumentDeleteRequestSchema
>;
