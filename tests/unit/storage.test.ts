import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(() => "mock-cert"),
  getApps: vi.fn(() => [{ name: "pgsms-firebase-admin" }]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(),
}));

import { getStorage } from "firebase-admin/storage";

import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  STORAGE_URL_EXPIRATION_MS,
  assertFileUploadConstraints,
  buildProposalStoragePath,
  generateUploadSignedUrl,
} from "@/lib/storage";

describe("storage utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("generates an upload signed URL with the expected expiration window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));

    const getSignedUrl = vi
      .fn()
      .mockResolvedValue(["https://storage.example.test/upload"]);

    vi.mocked(getStorage).mockReturnValue({
      bucket: vi.fn(() => ({
        file: vi.fn(() => ({
          getSignedUrl,
        })),
      })),
    } as never);

    const signedUrl = await generateUploadSignedUrl(
      "proposals/student-1/1/proposal.pdf",
      "application/pdf",
    );

    expect(signedUrl).toBe("https://storage.example.test/upload");
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write",
        contentType: "application/pdf",
        expires:
          new Date("2026-04-29T12:00:00.000Z").getTime() +
          STORAGE_URL_EXPIRATION_MS,
      }),
    );
  });

  it("sanitizes malicious filenames and removes traversal from built paths", () => {
    const storagePath = buildProposalStoragePath("student-1", 1, "../../evil.pdf");

    expect(storagePath).toBe("proposals/student-1/1/evil.pdf");
    expect(storagePath.includes("..")).toBe(false);
  });

  it("rejects files larger than 50MB at the utility layer", () => {
    expect(() => {
      assertFileUploadConstraints({
        contentType: "application/pdf",
        fileSizeBytes: MAX_STORAGE_FILE_SIZE_BYTES + 1,
        path: "proposals/student-1/1/proposal.pdf",
      });
    }).toThrow("File exceeds the 50MB upload limit.");
  });

  it("defines protected directory and file size rules in storage.rules", () => {
    const rulesPath = path.resolve(process.cwd(), "storage.rules");
    const rules = readFileSync(rulesPath, "utf8");

    expect(rules).toContain("allow write: if false;");
    expect(rules).toContain("50 * 1024 * 1024");
    expect(rules).toContain("match /proposals/{studentId}/{version}/{fileName}");
    expect(rules).toContain("match /theses/{studentId}/{fileName}");
    expect(rules).toContain("match /progress-reports/{studentId}/{reportId}/{fileName}");
    expect(rules).toContain("match /corrections/{studentId}/{thesisId}/{fileName}");
  });
});
