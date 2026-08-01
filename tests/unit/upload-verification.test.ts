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
    vi.unstubAllGlobals();
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

  it("accepts a clean response from an authenticated HTTPS scanner", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FILE_SCAN_MODE", "");
    vi.stubEnv("MALWARE_SCANNER_URL", "https://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "scanner-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ clean: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).resolves.toMatchObject({ fileName: "proposal.pdf" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://scanner.example.test/scan",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer scanner-token",
          "Content-Type": "application/octet-stream",
          "X-File-Name": "proposal.pdf",
          "X-Content-SHA256": createHash("sha256")
            .update(bytes)
            .digest("hex"),
        }),
      }),
    );
  });

  it("rejects a file when the scanner reports it as unsafe", async () => {
    const bytes = Buffer.from("%PDF-1.7\nunsafe content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FILE_SCAN_MODE", "");
    vi.stubEnv("MALWARE_SCANNER_URL", "https://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "scanner-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ clean: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/failed the malware safety check/i);
  });

  it("rejects insecure or unauthenticated scanner configuration in production", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FILE_SCAN_MODE", "");
    vi.stubEnv("MALWARE_SCANNER_URL", "http://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "scanner-token");

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/requires an HTTPS endpoint/i);

    vi.stubEnv("MALWARE_SCANNER_URL", "https://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "");

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/requires MALWARE_SCANNER_TOKEN/i);
  });

  it("fails closed when the scanner is unreachable or returns invalid JSON", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FILE_SCAN_MODE", "");
    vi.stubEnv("MALWARE_SCANNER_URL", "https://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "scanner-token");
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/could not verify the file/i);

    fetchMock.mockResolvedValueOnce(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/invalid response/i);
  });

  it("rejects an oversized scanner response before parsing it", async () => {
    const bytes = Buffer.from("%PDF-1.7\nverified content", "utf8");
    vi.mocked(downloadStorageObject).mockResolvedValue(bytes);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FILE_SCAN_MODE", "");
    vi.stubEnv("MALWARE_SCANNER_URL", "https://scanner.example.test/scan");
    vi.stubEnv("MALWARE_SCANNER_TOKEN", "scanner-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ clean: true, padding: "x".repeat(5000) }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      verifyStagedUploadFile(
        stagedFile({ expectedSizeBytes: bytes.length }),
      ),
    ).rejects.toThrow(/invalid response/i);
  });
});
