import { z } from "zod";

import { stagedUploadFileSchema } from "@/lib/uploads/schemas";
import { sanitizedString } from "@/lib/validation/schemas";

export const ethicsApprovalUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(stagedUploadFileSchema)
    .min(1, "Upload at least one ethics document.")
    .max(10, "Upload no more than 10 ethics documents."),
});

export const uploadedEthicsDocumentSchema = stagedUploadFileSchema;

export const ethicsApprovalSubmissionSchema = z.object({
  title: sanitizedString.min(1, "Ethics document title is required."),
  summary: sanitizedString.min(1, "Ethics document summary is required."),
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
});

export type EthicsApprovalUploadRequest = z.infer<
  typeof ethicsApprovalUploadRequestSchema
>;
export type EthicsApprovalSubmissionInput = z.infer<
  typeof ethicsApprovalSubmissionSchema
>;
