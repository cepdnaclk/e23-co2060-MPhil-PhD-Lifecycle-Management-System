import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/auth", () => ({
  authenticateBearerRequest: vi.fn(),
  AuthError: class AuthError extends Error {
    status: 401 | 403;

    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/dashboard/summary", () => ({
  DashboardAccessError: class DashboardAccessError extends Error {
    status: number;

    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
  getDashboardSummaryForUser: vi.fn(),
}));

import { GET } from "@/app/api/dashboard/[role]/summary/route";
import { authenticateBearerRequest } from "@/lib/firebase/auth";
import {
  DashboardAccessError,
  getDashboardSummaryForUser,
} from "@/lib/dashboard/summary";

describe("GET /api/dashboard/[role]/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a student from requesting another role's dashboard data", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-student-1",
      userId: "user-student-1",
      firebaseUid: "firebase-student-1",
      email: "student@example.com",
      role: "STUDENT",
    } as never);
    vi.mocked(getDashboardSummaryForUser).mockRejectedValue(
      new DashboardAccessError("Forbidden.", 403),
    );

    const response = await GET(
      new Request("http://localhost/api/dashboard/supervisor/summary", {
        headers: {
          cookie: "pgsms_session=session-token",
        },
      }) as never,
      {
        params: {
          role: "supervisor",
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden.",
    });
  });

  it("returns 404 for an unknown dashboard role", async () => {
    const response = await GET(
      new Request("http://localhost/api/dashboard/guest/summary") as never,
      {
        params: {
          role: "guest",
        },
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unknown dashboard role.",
    });
    expect(authenticateBearerRequest).not.toHaveBeenCalled();
  });

  it("returns a summary payload for the authenticated role", async () => {
    vi.mocked(authenticateBearerRequest).mockResolvedValue({
      uid: "firebase-admin-1",
      userId: "user-admin-1",
      firebaseUid: "firebase-admin-1",
      email: "admin@example.com",
      role: "ADMINISTRATOR",
    } as never);
    vi.mocked(getDashboardSummaryForUser).mockResolvedValue({
      role: "admin",
      roleLabel: "Administrator",
      title: "Operational control centre",
      subtitle: "Monitor core operations.",
      cards: [],
      quickActions: [],
      lastUpdatedIso: "2026-04-30T10:00:00.000Z",
    } as never);

    const response = await GET(
      new Request("http://localhost/api/dashboard/admin/summary", {
        headers: {
          cookie: "pgsms_session=session-token",
        },
      }) as never,
      {
        params: {
          role: "admin",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(getDashboardSummaryForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "ADMINISTRATOR",
      }),
      "admin",
    );
    await expect(response.json()).resolves.toMatchObject({
      summary: expect.objectContaining({
        role: "admin",
        roleLabel: "Administrator",
      }),
    });
  });
});
