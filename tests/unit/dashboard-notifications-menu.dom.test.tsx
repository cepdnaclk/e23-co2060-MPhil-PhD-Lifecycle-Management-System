/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardNotificationsMenu } from "@/components/dashboard/dashboard-notifications-menu";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("DashboardNotificationsMenu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads recent notifications and marks unread items as read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          unreadCount: 1,
          notifications: [
            {
              id: "notif-1",
              event: "PROGRESS_REPORT_SUBMITTED",
              title: "Progress report submitted: Q1 2026",
              message: "Alice has submitted a progress report for Q1 2026.",
              isRead: false,
              createdAt: "2026-05-01T10:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<DashboardNotificationsMenu />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/notifications?limit=8", {
        credentials: "include",
      });
    });

    const menuButton = screen.getByRole("button", { name: /notifications/i });

    await waitFor(() => {
      expect(menuButton).toHaveTextContent("1");
    });

    await user.click(menuButton);

    expect(
      await screen.findByText("Progress report submitted: Q1 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alice has submitted a progress report/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark all read/i }));

    expect(fetchMock).toHaveBeenLastCalledWith("/api/notifications", {
      method: "PATCH",
      credentials: "include",
    });

    await waitFor(() => {
      expect(menuButton).not.toHaveTextContent("1");
    });
  });
});
