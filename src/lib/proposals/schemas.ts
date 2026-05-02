import { ProposalStatus } from "@prisma/client";
import { z } from "zod";

import { MAX_STORAGE_FILE_SIZE_BYTES } from "@/lib/validation/uploads";
import { optionalSanitizedString, sanitizedString } from "@/lib/validation/schemas";

const uploadedProposalDocumentSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  storagePath: sanitizedString.min(1, "A storage path is required."),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const proposalUploadRequestSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  contentType: z.literal("application/pdf"),
  fileSizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const proposalSubmissionSchema = z.object({
  title: sanitizedString.min(5, "Enter the proposal title."),
  abstract: sanitizedString.min(30, "Provide a short proposal abstract."),
  document: uploadedProposalDocumentSchema,
});

export const proposalStatusUpdateSchema = z.object({
  status: z.enum([
    ProposalStatus.SUBMITTED,
    ProposalStatus.UNDER_REVIEW,
    ProposalStatus.APPROVED,
    ProposalStatus.REJECTED,
  ]),
  feedback: z.string().trim().max(5000).optional(),
});

export type ProposalUploadRequest = z.infer<typeof proposalUploadRequestSchema>;
export type ProposalSubmissionInput = z.infer<typeof proposalSubmissionSchema>;
export type ProposalStatusUpdateInput = z.infer<typeof proposalStatusUpdateSchema>;
