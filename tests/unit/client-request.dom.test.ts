/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { secureFetch } from "@/lib/security/client-request";

const fetchMock = vi.fn<typeof fetch>();

describe("secureFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    document.cookie = "pglms_csrf=csrf-token; path=/";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("adds the CSRF header to same-origin state-changing requests", async () => {
    await secureFetch("/api/proposals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(headers.get("x-pglms-csrf")).toBe("csrf-token");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("does not disclose the CSRF token on cross-origin signed uploads", async () => {
    await secureFetch("https://storage.example/signed-upload", {
      method: "PUT",
      body: "file-content",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(headers.has("x-pglms-csrf")).toBe(false);
  });
});
