/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentRepositoryPanel } from "@/components/documents/document-repository-panel";

const repositoryDocument = {
  id: "doc-1",
  documentType: "THESIS",
  fileName: "thesis.pdf",
  title: "Adaptive Systems Thesis",
  summary: "A thesis about adaptive systems.",
  tags: ["thesis", "current", "under-examination"],
  mimeType: "application/pdf",
  version: 1,
  isCurrentVersion: true,
  storagePath: "theses/student-1/1/thesis.pdf",
  createdAt: "2026-05-01T04:00:00.000Z",
};

describe("DocumentRepositoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders repository results and opens signed download URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [repositoryDocument],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downloadUrl: "https://storage.example.test/read?path=thesis.pdf",
        }),
      });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentRepositoryPanel role="admin" />);

    expect(await screen.findAllByText("Adaptive Systems Thesis")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1", {
        credentials: "include",
      });
      expect(openMock).toHaveBeenCalledWith(
        "https://storage.example.test/read?path=thesis.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("hides archive controls from non-admin users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documents: [repositoryDocument],
        }),
      }),
    );

    render(<DocumentRepositoryPanel role="student" />);

    expect(await screen.findAllByText("Adaptive Systems Thesis")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("requires an explicit document review before archiving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [repositoryDocument] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentRepositoryPanel role="admin" />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Archive" }))[0]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Archive document" })).toBeInTheDocument();
    expect(screen.getByText("thesis.pdf", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive document" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/documents/doc-1",
        expect.objectContaining({ method: "PATCH", credentials: "include" }),
      );
    });
    expect(await screen.findByText(/Recorded .* Keep this receipt/)).toBeInTheDocument();
  });

  it("waits for an explicit search before applying edited filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentRepositoryPanel role="student" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "ethics approval" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/documents?q=ethics+approval",
        { credentials: "include" },
      );
    });
  });

  it("normalizes all-category and any-tag selections to an unfiltered request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentRepositoryPanel role="student" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/documents", {
        credentials: "include",
      });
    });
  });
});
