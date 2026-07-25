import { ProposalStatus } from "@prisma/client";
import { z } from "zod";

import {
  stagedUploadFileSchema,
} from "@/lib/uploads/schemas";
import { sanitizedString } from "@/lib/validation/schemas";

export const proposalUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(stagedUploadFileSchema)
    .min(1, "Upload at least one proposal document.")
    .max(10, "Upload no more than 10 proposal documents in one version."),
});

export const proposalSubmissionSchema = z.object({
  title: sanitizedString.min(5, "Proposal title must be at least 5 characters long."),
  abstract: sanitizedString.min(1, "Proposal abstract is required."),
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
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
