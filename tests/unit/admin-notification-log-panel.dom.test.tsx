/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotificationLogPanel } from "@/components/admin/notification-log-panel";

const logPage = {
  logs: [
    {
      id: "log-1",
      recipientId: "user-supervisor-1",
      recipientEmail: "supervisor@example.com",
      recipientName: "Dr. Smith",
      event: "PROGRESS_REPORT_SUBMITTED",
      subject: "Progress report submitted for Q1 2026",
      deliveryStatus: "SENT",
      failureReason: null,
      createdAt: "2026-05-01T10:00:00.000Z",
    },
    {
      id: "log-2",
      recipientId: "user-student-1",
      recipientEmail: "student@example.com",
      recipientName: "Alice",
      event: "REGISTRATION_EXPIRY_APPROACHING",
      subject: "Registration expiry reminder: 14 days remaining",
      deliveryStatus: "FAILED",
      failureReason: "ECONNREFUSED",
      createdAt: "2026-05-01T09:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  pageCount: 1,
};

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("NotificationLogPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders read-only notification logs, filters by recipient, and opens CSV export", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(logPage));
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<NotificationLogPanel />);

    expect(
      await screen.findByText("Progress report submitted for Q1 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Registration expiry reminder: 14 days remaining")).toBeInTheDocument();
    expect(screen.getAllByText("Failed").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Recipient ID"), "user-student-1");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("recipientId=user-student-1"),
        ),
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/notification-log?"),
      "_blank",
      "noopener,noreferrer",
    );
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("format=csv"),
      "_blank",
      "noopener,noreferrer",
    );
  });
});
