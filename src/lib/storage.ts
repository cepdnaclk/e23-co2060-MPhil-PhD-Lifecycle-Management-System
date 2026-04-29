import { getFirebaseAdminBucket } from "@/lib/firebase/admin";
import type { AuthenticatedUserContext } from "@/types/auth";

export const STORAGE_URL_EXPIRATION_MS = 15 * 60 * 1000;
export const MAX_STORAGE_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const PROTECTED_STORAGE_ROOTS = [
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

export function buildThesisStoragePath(studentId: string, fileName: string) {
  return normalizeStoragePath(
    `theses/${studentId}/${sanitizeFileName(fileName)}`,
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
  const bucket = getFirebaseAdminBucket();
  const [signedUrl] = await bucket.file(normalizedPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + STORAGE_URL_EXPIRATION_MS,
    contentType,
  });

  return signedUrl;
}

export async function generateDownloadSignedUrl(path: string): Promise<string> {
  const normalizedPath = normalizeStoragePath(path);
  const bucket = getFirebaseAdminBucket();
  const [signedUrl] = await bucket.file(normalizedPath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + STORAGE_URL_EXPIRATION_MS,
  });

  return signedUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const normalizedPath = normalizeStoragePath(path);
  const bucket = getFirebaseAdminBucket();

  await bucket.file(normalizedPath).delete({
    ignoreNotFound: true,
  });
}
