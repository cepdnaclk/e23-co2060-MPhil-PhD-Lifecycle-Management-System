import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/applications/submission", () => ({
  ApplicationSubmissionError: class ApplicationSubmissionError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  createApplicationUploadUrl: vi.fn(),
  deleteUploadedApplicationDocument: vi.fn(),
  verifyApplicationDocument: vi.fn(),
}));

vi.mock("@/lib/http/errors", () => ({
  createServerErrorResponse: vi.fn(async ({ message }) =>
    Response.json({ error: message }, { status: 500 }),
  ),
}));

import {
  DELETE,
  POST as LEGACY_POST,
} from "@/app/api/applications/upload/route";
import { POST as VERIFY_POST } from "@/app/api/applications/upload/verify/route";
import { POST as UPLOAD_URL_POST } from "@/app/api/applications/upload-url/route";
import {
  ApplicationSubmissionError,
  createApplicationUploadUrl,
  deleteUploadedApplicationDocument,
  verifyApplicationDocument,
} from "@/lib/applications/submission";

describe("application upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the legacy server-proxied upload route", async () => {
    const response = await LEGACY_POST();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/direct document uploads are required/i),
    });
  });

  it("creates a signed direct-upload target", async () => {
    vi.mocked(createApplicationUploadUrl).mockResolvedValue({
      storagePath: "applications/application-1/staged/file-1/cv.pdf",
      signedUrl: "https://storage.example.test/upload?token=signed",
      expiresInMinutes: 15,
    });

    const response = await UPLOAD_URL_POST(
      new Request("http://localhost/api/applications/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "application-1",
          draftToken: "draft-token",
          fileName: "cv.pdf",
          contentType: "application/pdf",
          fileSizeBytes: 1024,
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      signedUrl: "https://storage.example.test/upload?token=signed",
    });
  });

  it("verifies a document after the browser uploads it to storage", async () => {
    vi.mocked(verifyApplicationDocument).mockResolvedValue({
      storagePath: "applications/application-1/staged/file-1/cv.pdf",
      fileName: "cv.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });

    const response = await VERIFY_POST(
      new Request("http://localhost/api/applications/upload/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "application-1",
          draftToken: "draft-token",
          storagePath: "applications/application-1/staged/file-1/cv.pdf",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(verifyApplicationDocument).toHaveBeenCalledWith({
      draftId: "application-1",
      draftToken: "draft-token",
      storagePath: "applications/application-1/staged/file-1/cv.pdf",
    });
  });

  it("returns the verification error status", async () => {
    vi.mocked(verifyApplicationDocument).mockRejectedValue(
      new ApplicationSubmissionError(
        "The malware scanner could not verify the file.",
        409,
      ),
    );

    const response = await VERIFY_POST(
      new Request("http://localhost/api/applications/upload/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "application-1",
          draftToken: "draft-token",
          storagePath: "applications/application-1/staged/file-1/cv.pdf",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "The malware scanner could not verify the file.",
    });
  });

  it("removes an uploaded supporting document", async () => {
    vi.mocked(deleteUploadedApplicationDocument).mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/applications/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "application-1",
          draftToken: "draft-token",
          storagePath: "applications/application-1/staged/file-1/cv.pdf",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteUploadedApplicationDocument).toHaveBeenCalledWith({
      draftId: "application-1",
      draftToken: "draft-token",
      storagePath: "applications/application-1/staged/file-1/cv.pdf",
    });
  });
});
