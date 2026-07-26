import { z } from "zod";

import { stagedUploadFileSchema } from "@/lib/uploads/schemas";

export const progressReportDocumentSchema = stagedUploadFileSchema;

export const progressReportUploadRequestSchema = z.object({
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(progressReportDocumentSchema)
    .min(1, "Upload at least one progress report document.")
    .max(10, "Upload no more than 10 progress report documents."),
});

export type ProgressReportDocumentInput = z.infer<
  typeof progressReportDocumentSchema
>;
export type ProgressReportUploadRequest = z.infer<
  typeof progressReportUploadRequestSchema
>;
