import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUserContext } from "@/types/auth";
import {
  MAX_APPLICATION_UPLOAD_SIZE_BYTES,
  MAX_STORAGE_FILE_SIZE_BYTES,
} from "@/lib/validation/uploads";

export const STORAGE_URL_EXPIRATION_MS = 15 * 60 * 1000;
export { MAX_APPLICATION_UPLOAD_SIZE_BYTES, MAX_STORAGE_FILE_SIZE_BYTES };
export const PROTECTED_STORAGE_ROOTS = [
  "applications",
  "proposals",
  "theses",
  "progress-reports",
  "corrections",
] as const;

type ProtectedStorageRoot = (typeof PROTECTED_STORAGE_ROOTS)[number];

type UploadConstraintsInput = {
  contentType: string;
  fileSizeBytes: number;
  path: string;
};

export class StorageAccessError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 413) {
    super(message);
    this.name = "StorageAccessError";
  }
}

let cachedSupabaseClient: SupabaseClient | undefined;

export function resetSupabaseClientForTests() {
  cachedSupabaseClient = undefined;
}

function getSupabaseClient(): SupabaseClient {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new StorageAccessError(
      "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      400,
    );
  }

  cachedSupabaseClient = createClient(supabaseUrl, supabaseKey);
  return cachedSupabaseClient;
}

function getSupabaseBucketName(): string {
  const bucketName =
    process.env.SUPABASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new StorageAccessError(
      "Supabase Storage bucket is not configured. Set SUPABASE_STORAGE_BUCKET.",
      400,
    );
  }

  return bucketName;
}

function getProtectedStorageRoot(
  value: string,
): ProtectedStorageRoot | undefined {
  return PROTECTED_STORAGE_ROOTS.find((root) => root === value);
}

export function sanitizeFileName(fileName: string): string {
  const trimmedName = fileName.trim().replace(/\\/g, "/");
  const baseName = trimmedName.split("/").pop()?.trim() ?? "";
  const sanitizedName = baseName.replace(/[^A-Za-z0-9._-]/g, "-");

  if (!sanitizedName || sanitizedName === "." || sanitizedName === "..") {
    throw new StorageAccessError("Invalid file name.", 400);
  }

  return sanitizedName;
}

export function normalizeStoragePath(storagePath: string): string {
  const normalizedSegments = storagePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    normalizedSegments.length === 0 ||
    normalizedSegments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new StorageAccessError("Invalid storage path.", 400);
  }

  const [root] = normalizedSegments;

  if (!root || !getProtectedStorageRoot(root)) {
    throw new StorageAccessError("Unsupported storage directory.", 400);
  }

  return normalizedSegments.join("/");
}

export function buildProposalStoragePath(
  studentId: string,
  version: number,
  fileName: string,
) {
  return normalizeStoragePath(
    `proposals/${studentId}/${version}/${sanitizeFileName(fileName)}`,
  );
}

export function buildApplicationAttachmentStoragePath(
  draftId: string,
  fileName: string,
) {
  return normalizeStoragePath(
    `applications/${draftId}/${sanitizeFileName(fileName)}`,
  );
}

export function buildThesisStoragePath(studentId: string, fileName: string) {
  return normalizeStoragePath(
    `theses/${studentId}/${sanitizeFileName(fileName)}`,
  );
}

export function buildVersionedThesisStoragePath(
  studentId: string,
  version: number,
  fileName: string,
) {
  return normalizeStoragePath(
    `theses/${studentId}/${version}/${sanitizeFileName(fileName)}`,
  );
}

export function buildProgressReportStoragePath(
  studentId: string,
  reportId: string,
  fileName: string,
) {
  return normalizeStoragePath(
    `progress-reports/${studentId}/${reportId}/${sanitizeFileName(fileName)}`,
  );
}

export function buildCorrectionStoragePath(
  studentId: string,
  thesisId: string,
  fileName: string,
) {
  return normalizeStoragePath(
    `corrections/${studentId}/${thesisId}/${sanitizeFileName(fileName)}`,
  );
}

export function assertFileUploadConstraints({
  contentType,
  fileSizeBytes,
  path,
}: UploadConstraintsInput): void {
  if (!contentType.trim()) {
    throw new StorageAccessError("A content type is required.", 400);
  }

  if (fileSizeBytes <= 0) {
    throw new StorageAccessError("File size must be greater than zero.", 400);
  }

  if (fileSizeBytes > MAX_STORAGE_FILE_SIZE_BYTES) {
    throw new StorageAccessError(
      "File exceeds the 50MB upload limit.",
      413,
    );
  }

  normalizeStoragePath(path);
}

export function assertApplicationAttachmentConstraints({
  contentType,
  fileSizeBytes,
  path,
}: UploadConstraintsInput): void {
  if (contentType !== "application/pdf") {
    throw new StorageAccessError("Only PDF documents are allowed.", 400);
  }

  if (fileSizeBytes <= 0) {
    throw new StorageAccessError("File size must be greater than zero.", 400);
  }

  if (fileSizeBytes > MAX_APPLICATION_UPLOAD_SIZE_BYTES) {
    throw new StorageAccessError("File exceeds the 10MB upload limit.", 413);
  }

  const normalizedPath = normalizeStoragePath(path);

  if (!normalizedPath.startsWith("applications/")) {
    throw new StorageAccessError(
      "Application documents must be uploaded to the applications directory.",
      400,
    );
  }
}

export function getStorageObjectOwnerId(storagePath: string): string {
  const normalizedPath = normalizeStoragePath(storagePath);
  const [, ownerId] = normalizedPath.split("/");

  if (!ownerId) {
    throw new StorageAccessError("Storage path is missing an owner segment.", 400);
  }

  return ownerId;
}

export function assertCanAccessStoragePath(
  auth: AuthenticatedUserContext,
  storagePath: string,
): void {
  if (auth.role === "ADMINISTRATOR") {
    return;
  }

  if (auth.role !== "STUDENT") {
    throw new StorageAccessError(
      "Only students and administrators can access this storage path.",
      403,
    );
  }

  const ownerId = getStorageObjectOwnerId(storagePath);

  if (ownerId !== auth.userId) {
    throw new StorageAccessError("Document access denied.", 403);
  }
}

export async function generateUploadSignedUrl(
  path: string,
  contentType: string,
): Promise<string> {
  const normalizedPath = normalizeStoragePath(path);
  const supabase = getSupabaseClient();
  const bucketName = getSupabaseBucketName();

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl(normalizedPath);

  if (error || !data?.signedUrl) {
    throw new StorageAccessError(`Failed to generate upload URL: ${error?.message || 'Unknown error'}`, 400);
  }

  return data.signedUrl;
}

export async function uploadBufferToStorage(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const normalizedPath = normalizeStoragePath(path);
  const supabase = getSupabaseClient();
  const bucketName = getSupabaseBucketName();

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(normalizedPath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new StorageAccessError(`Failed to upload buffer: ${error.message}`, 400);
  }
}

export async function generateDownloadSignedUrl(path: string): Promise<string> {
  const normalizedPath = normalizeStoragePath(path);
  const supabase = getSupabaseClient();
  const bucketName = getSupabaseBucketName();

  const expiresInSeconds = Math.floor(STORAGE_URL_EXPIRATION_MS / 1000);

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new StorageAccessError(`Failed to generate download URL: ${error?.message || 'Unknown error'}`, 400);
  }

  return data.signedUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const normalizedPath = normalizeStoragePath(path);
  const supabase = getSupabaseClient();
  const bucketName = getSupabaseBucketName();

  const { error } = await supabase.storage
    .from(bucketName)
    .remove([normalizedPath]);

  if (error) {
    throw new StorageAccessError(`Failed to delete file: ${error.message}`, 400);
  }
}
