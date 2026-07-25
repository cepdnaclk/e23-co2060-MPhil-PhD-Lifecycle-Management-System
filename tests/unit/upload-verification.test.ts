import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  downloadStorageObject: vi.fn(),
}));

import { downloadStorageObject } from "@/lib/storage";
import {
  UploadVerificationError,
  verifyStagedUploadFile,
} from "@/lib/uploads/verification";

function stagedFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    ordinal: 0,
    fileName: "proposal.pdf",
    storagePath: "proposals/student-1/staged/session-1/file-1/proposal.pdf",
    expectedMimeType: "application/pdf",
    expectedSizeBytes: 0,
    expectedSha256: null,
    ...overrides,
  } as never;
}

function makeStructuralZip(fileName: string) {
  const encodedName = Buffer.from(fileName, "utf8");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);

  const centralEntry = Buffer.alloc(46 + encodedName.length);
  centralEntry.writeUInt32LE(0x02014b50, 0);
  centralEntry.writeUInt16LE(encodedName.length, 28);
  encodedName.copy(centralEntry, 46);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralEntry.length, 12);
  endRecord.writeUInt32LE(localHeader.length, 16);

  return Buffer.concat([localHeader, centralEntry, endRecord]);
}

describe("staged upload byte verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FILE_SCAN_MODE", "structural");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("derives the trusted size, MIME type, and checksum from downloaded bytes", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);

    await expect(
      verifyStagedUploadFile(
        stagedFile({
          expectedSizeBytes: bytes.length,
          expectedSha256: createHash("sha256").update(bytes).digest("hex"),
        }),
      ),
    ).resolves.toMatchObject({
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("rejects a file whose bytes do not match its declared PDF type", async () => {
    const bytes = Buffer.from("not actually a PDF", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);

    await expect(
      verifyStagedUploadFile(
        stagedFile({
          expectedSizeBytes: bytes.length,
        }),
      ),
    ).rejects.toBeInstanceOf(UploadVerificationError);
  });

  it("rejects ZIP traversal paths before a document version is finalized", async () => {
    const bytes = makeStructuralZip("../outside.pdf");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);

    await expect(
      verifyStagedUploadFile(
        stagedFile({
          fileName: "evidence.zip",
          expectedMimeType: "application/zip",
          expectedSizeBytes: bytes.length,
        }),
      ),
    ).rejects.toThrow(/unsafe path/i);
  });

  it("fails closed in production when no malware scanner is configured", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MALWARE_SCANNER_URL", "");

    await expect(
      verifyStagedUploadFile(
        stagedFile({
          expectedSizeBytes: bytes.length,
        }),
      ),
    ).rejects.toThrow(/malware scanning is required/i);
  });
});
