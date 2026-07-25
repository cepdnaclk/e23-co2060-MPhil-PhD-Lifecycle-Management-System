import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Supabase
const mockCreateSignedUploadUrl = vi.fn();
const mockCreateSignedUrl = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  assertFileUploadConstraints,
  buildProposalStoragePath,
  generateUploadSignedUrl,
  resetSupabaseClientForTests,
} from "@/lib/storage";

describe("storage utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetSupabaseClientForTests();
  });

  it("generates an upload signed URL via Supabase", async () => {
    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "mock-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "demo-bucket");

    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.supabase.test/upload" },
      error: null,
    });

    const signedUrl = await generateUploadSignedUrl(
      "proposals/student-1/1/proposal.pdf",
      "application/pdf",
    );

    expect(signedUrl).toBe("https://storage.supabase.test/upload");
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      "proposals/student-1/1/proposal.pdf",
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
});
