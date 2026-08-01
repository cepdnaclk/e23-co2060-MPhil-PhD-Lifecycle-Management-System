import { createHash } from "node:crypto";

import type { StagedUploadFile } from "@prisma/client";

import { downloadStorageObject } from "@/lib/storage";

const MAX_ARCHIVE_ENTRIES = 500;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_SCANNER_RESPONSE_BYTES = 4 * 1024;
const MALWARE_SCANNER_TIMEOUT_MS = 30_000;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_FILE = 0x02014b50;

const ALLOWED_ARCHIVE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".csv",
  ".doc",
  ".docx",
  ".h",
  ".ipynb",
  ".java",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m",
  ".md",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".py",
  ".r",
  ".sql",
  ".tex",
  ".tif",
  ".tiff",
  ".ts",
  ".txt",
  ".xls",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
]);

export class UploadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadVerificationError";
  }
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function detectMimeType(buffer: Buffer): "application/pdf" | "application/zip" {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  const signature = buffer.length >= 4 ? buffer.readUInt32LE(0) : 0;
  if (
    signature === 0x04034b50 ||
    signature === 0x06054b50 ||
    signature === 0x08074b50
  ) {
    return "application/zip";
  }

  throw new UploadVerificationError(
    "The uploaded bytes do not match an allowed PDF or ZIP document.",
  );
}

function findZipEndOfCentralDirectory(buffer: Buffer) {
  const lowerBound = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw new UploadVerificationError("The ZIP central directory is missing.");
}

function assertSafeArchivePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === ".." || segment.includes("\0"))
  ) {
    throw new UploadVerificationError(
      `The ZIP contains an unsafe path: ${fileName}`,
    );
  }

  if (normalized.endsWith("/")) {
    return;
  }

  const dotIndex = normalized.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? normalized.slice(dotIndex).toLowerCase() : "";

  if (!ALLOWED_ARCHIVE_EXTENSIONS.has(extension)) {
    throw new UploadVerificationError(
      `The ZIP contains a disallowed file type: ${fileName}`,
    );
  }
}

function assertSafeZip(buffer: Buffer) {
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new UploadVerificationError(
      `The ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries.`,
    );
  }

  if (
    centralDirectoryOffset + centralDirectorySize > buffer.length ||
    centralDirectoryOffset >= endOffset
  ) {
    throw new UploadVerificationError("The ZIP central directory is invalid.");
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_FILE
    ) {
      throw new UploadVerificationError("The ZIP entry table is invalid.");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset =
      offset + 46 + fileNameLength + extraLength + commentLength;

    if (nextOffset > buffer.length) {
      throw new UploadVerificationError("The ZIP entry table is truncated.");
    }

    if ((flags & 0x1) !== 0) {
      throw new UploadVerificationError("Encrypted ZIP entries are not allowed.");
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new UploadVerificationError(
        "The ZIP uses an unsupported compression method.",
      );
    }

    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");
    assertSafeArchivePath(fileName);

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new UploadVerificationError(
        "The ZIP expands beyond the allowed uncompressed size.",
      );
    }

    if (
      compressedSize > 0 &&
      uncompressedSize > 10 * 1024 * 1024 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new UploadVerificationError(
        "The ZIP compression ratio exceeds the safety limit.",
      );
    }

    offset = nextOffset;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new UploadVerificationError("The ZIP central directory size is invalid.");
  }
}

function getMalwareScannerConfig() {
  const configuredUrl = process.env.MALWARE_SCANNER_URL?.trim();
  const token = process.env.MALWARE_SCANNER_TOKEN?.trim();

  if (!configuredUrl) {
    throw new UploadVerificationError(
      "Malware scanning is required but MALWARE_SCANNER_URL is not configured.",
    );
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new UploadVerificationError(
      "MALWARE_SCANNER_URL must be a valid HTTP(S) URL.",
    );
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new UploadVerificationError(
      "MALWARE_SCANNER_URL must be an HTTP(S) URL without credentials or a fragment.",
    );
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new UploadVerificationError(
      "Production malware scanning requires an HTTPS endpoint.",
    );
  }

  if (process.env.NODE_ENV === "production" && !token) {
    throw new UploadVerificationError(
      "Production malware scanning requires MALWARE_SCANNER_TOKEN.",
    );
  }

  return { url: url.toString(), token };
}

async function readScannerResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SCANNER_RESPONSE_BYTES
  ) {
    throw new UploadVerificationError(
      "The malware scanner returned an invalid response.",
    );
  }

  if (!response.body) {
    throw new UploadVerificationError(
      "The malware scanner returned an invalid response.",
    );
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_SCANNER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new UploadVerificationError(
          "The malware scanner returned an invalid response.",
        );
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new UploadVerificationError(
      "The malware scanner returned an invalid response.",
    );
  }
}

async function assertMalwareScanClean(
  buffer: Buffer,
  input: { fileName: string; checksumSha256: string },
) {
  const scannerUrl = process.env.MALWARE_SCANNER_URL?.trim();
  const structuralOnly =
    process.env.NODE_ENV !== "production" &&
    (process.env.FILE_SCAN_MODE === "structural" || !scannerUrl);

  if (structuralOnly) {
    return;
  }

  const scanner = getMalwareScannerConfig();
  let response: Response;

  try {
    response = await fetch(scanner.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(input.fileName),
        "X-Content-SHA256": input.checksumSha256,
        ...(scanner.token
          ? { Authorization: `Bearer ${scanner.token}` }
          : {}),
      },
      body: buffer,
      redirect: "error",
      signal: AbortSignal.timeout(MALWARE_SCANNER_TIMEOUT_MS),
    });
  } catch {
    throw new UploadVerificationError(
      "The malware scanner could not verify the file.",
    );
  }

  if (!response.ok) {
    throw new UploadVerificationError("The malware scanner could not verify the file.");
  }

  const result = await readScannerResponse(response);
  if (
    typeof result !== "object" ||
    result === null ||
    !("clean" in result) ||
    result.clean !== true
  ) {
    throw new UploadVerificationError(
      "The uploaded file failed the malware safety check.",
    );
  }
}

export type VerifiedUploadFile = {
  id: string;
  ordinal: number;
  fileName: string;
  storagePath: string;
  mimeType: "application/pdf" | "application/zip";
  sizeBytes: number;
  checksumSha256: string;
};

export async function verifyStagedUploadFile(
  file: Pick<
    StagedUploadFile,
    | "id"
    | "ordinal"
    | "fileName"
    | "storagePath"
    | "expectedMimeType"
    | "expectedSizeBytes"
    | "expectedSha256"
  >,
): Promise<VerifiedUploadFile> {
  const buffer = await downloadStorageObject(file.storagePath);
  const actualMimeType = detectMimeType(buffer);
  const checksumSha256 = sha256(buffer);

  if (buffer.length !== file.expectedSizeBytes) {
    throw new UploadVerificationError(
      `Uploaded size does not match the declared size for ${file.fileName}.`,
    );
  }

  const normalizedExpectedMime =
    file.expectedMimeType === "application/x-zip-compressed"
      ? "application/zip"
      : file.expectedMimeType;
  if (actualMimeType !== normalizedExpectedMime) {
    throw new UploadVerificationError(
      `Uploaded content does not match the declared type for ${file.fileName}.`,
    );
  }

  if (file.expectedSha256 && checksumSha256 !== file.expectedSha256) {
    throw new UploadVerificationError(
      `Uploaded checksum does not match for ${file.fileName}.`,
    );
  }

  if (actualMimeType === "application/zip") {
    assertSafeZip(buffer);
  }

  await assertMalwareScanClean(buffer, {
    fileName: file.fileName,
    checksumSha256,
  });

  return {
    id: file.id,
    ordinal: file.ordinal,
    fileName: file.fileName,
    storagePath: file.storagePath,
    mimeType: actualMimeType,
    sizeBytes: buffer.length,
    checksumSha256,
  };
}

export function buildEvidenceManifestHash(files: VerifiedUploadFile[]) {
  const manifest = [...files]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((file) => ({
      ordinal: file.ordinal,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksumSha256: file.checksumSha256,
    }));

  return sha256(JSON.stringify(manifest));
}
