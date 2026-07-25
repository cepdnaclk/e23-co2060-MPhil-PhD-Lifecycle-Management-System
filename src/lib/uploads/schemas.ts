import { UploadPurpose } from "@prisma/client";
import { z } from "zod";

import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_STORAGE_FILE_SIZE_BYTES,
} from "@/lib/validation/uploads";
import { sanitizedString } from "@/lib/validation/schemas";

export const stagedUploadFileSchema = z.object({
  fileName: sanitizedString.min(1, "A file name is required."),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, "SHA-256 must contain 64 hexadecimal characters.")
    .optional(),
});

export const createUploadSessionSchema = z.object({
  purpose: z.nativeEnum(UploadPurpose),
  idempotencyKey: z.string().uuid("A valid upload idempotency key is required."),
  files: z
    .array(stagedUploadFileSchema)
    .min(1, "Upload at least one document.")
    .max(10, "Upload no more than 10 documents in one version."),
});

export const finalizeUploadSessionSchema = z.object({
  uploadSessionId: z.string().uuid("A valid upload session ID is required."),
});

export type StagedUploadFileInput = z.infer<typeof stagedUploadFileSchema>;
