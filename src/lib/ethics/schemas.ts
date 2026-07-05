import { EthicsApprovalStatus } from "@prisma/client";
import { z } from "zod";

import { sanitizedString } from "@/lib/validation/schemas";
import { MAX_STORAGE_FILE_SIZE_BYTES } from "@/lib/validation/uploads";

export const ethicsApprovalUploadRequestSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  contentType: z.literal("application/pdf"),
  fileSizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const uploadedEthicsDocumentSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const ethicsApprovalSubmissionSchema = z.object({
  title: sanitizedString.min(
    5,
    "Ethics application title must be at least 5 characters long.",
  ),
  summary: sanitizedString.min(
    30,
    "Ethics summary must be at least 30 characters long.",
  ),
  document: uploadedEthicsDocumentSchema,
});

export const ethicsApprovalDecisionSchema = z.object({
  status: z.enum([
    EthicsApprovalStatus.UNDER_REVIEW,
    EthicsApprovalStatus.APPROVED,
    EthicsApprovalStatus.REJECTED,
  ]),
  reviewNotes: z.string().trim().max(5000).optional(),
});

export type EthicsApprovalUploadRequest = z.infer<
  typeof ethicsApprovalUploadRequestSchema
>;
export type EthicsApprovalSubmissionInput = z.infer<
  typeof ethicsApprovalSubmissionSchema
>;
export type EthicsApprovalDecisionInput = z.infer<
  typeof ethicsApprovalDecisionSchema
>;
