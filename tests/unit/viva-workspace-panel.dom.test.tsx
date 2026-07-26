/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VivaWorkspacePanel } from "@/components/examiner/viva-workspace-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

const assignedViva = {
  id: "viva-1",
  scheduledDate: "2026-05-15T10:00:00.000Z",
  venue: "Boardroom 1",
      outcome: null,
      recommendation: null,
  thesis: {
    id: "thesis-1",
    title: "Adaptive Systems Thesis",
    abstract: "A thesis about adaptive systems.",
    status: "UNDER_EXAMINATION",
    student: {
      user: {
        displayName: "Student One",
        email: "student@example.com",
      },
    },
  },
};

describe("VivaWorkspacePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a signed thesis download URL for an assigned viva", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          fileName: "thesis.pdf",
        },
        downloadUrl: "https://storage.example.test/read?path=thesis.pdf",
      }),
    });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchMock);

    render(<VivaWorkspacePanel vivas={[assignedViva]} />);

    fireEvent.click(screen.getByRole("button", { name: /download thesis/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/theses/thesis-1/download", {
        credentials: "include",
      });
      expect(openMock).toHaveBeenCalledWith(
        "https://storage.example.test/read?path=thesis.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });

    expect(
      await screen.findByText("Secure download opened for thesis.pdf."),
    ).toBeInTheDocument();
  });
});
