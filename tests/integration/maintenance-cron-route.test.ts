import { createHmac } from "node:crypto";

import { MaintenanceRunStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/errors", () => ({
  createServerErrorResponse: vi.fn(async () =>
    Response.json({ error: "Maintenance execution failed." }, { status: 500 }),
  ),
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    maintenanceRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/progress-reports/maintenance", () => ({
  markOverdueProgressReports: vi.fn(),
}));

vi.mock("@/lib/uploads/sessions", () => ({
  cleanupExpiredUploadSessions: vi.fn().mockResolvedValue({
    expiredSessionCount: 0,
    deletedObjectCount: 0,
  }),
}));

vi.mock("@/lib/registrations", () => ({
  runRegistrationMaintenance: vi.fn(),
}));

import * as cronRoute from "@/app/api/cron/check-registrations/route";
import { prisma } from "@/lib/prisma/client";
import { markOverdueProgressReports } from "@/lib/progress-reports/maintenance";
import { runRegistrationMaintenance } from "@/lib/registrations";

const CRON_SECRET = "s".repeat(48);
const ROUTE_URL = "http://localhost/api/cron/check-registrations";

function makeSignedRequest(input?: {
  secret?: string;
  timestamp?: number;
  runKey?: string;
  signature?: string;
}) {
  const timestamp = String(input?.timestamp ?? Math.floor(Date.now() / 1000));
  const runKey =
    input?.runKey ??
    new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const signature =
    input?.signature ??
    createHmac("sha256", input?.secret ?? CRON_SECRET)
      .update(
        `${timestamp}\n${runKey}\nPOST\n/api/cron/check-registrations`,
        "utf8",
      )
      .digest("hex");

  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      "x-cron-run-key": runKey,
      "x-cron-signature": `sha256=${signature}`,
      "x-cron-timestamp": timestamp,
    },
  });
}

describe("POST /api/cron/check-registrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.mocked(prisma.maintenanceRun.create).mockResolvedValue({
      id: "maintenance-run-1",
    } as never);
    vi.mocked(prisma.maintenanceRun.update).mockResolvedValue({} as never);
    vi.mocked(runRegistrationMaintenance).mockResolvedValue({
      lapsedCount: 2,
      reminderCount: 3,
    });
    vi.mocked(markOverdueProgressReports).mockResolvedValue(4);
  });

  it("does not export a state-changing GET handler", () => {
    expect("GET" in cronRoute).toBe(false);
  });

  it("fails closed without a securely configured server secret", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await cronRoute.POST(makeSignedRequest());

    expect(response.status).toBe(503);
    expect(prisma.maintenanceRun.create).not.toHaveBeenCalled();
    expect(runRegistrationMaintenance).not.toHaveBeenCalled();
    expect(markOverdueProgressReports).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before claiming or running work", async () => {
    const response = await cronRoute.POST(
      makeSignedRequest({ signature: "0".repeat(64) }),
    );

    expect(response.status).toBe(401);
    expect(prisma.maintenanceRun.create).not.toHaveBeenCalled();
    expect(runRegistrationMaintenance).not.toHaveBeenCalled();
  });

  it("rejects expired credentials before claiming or running work", async () => {
    const response = await cronRoute.POST(
      makeSignedRequest({
        timestamp: Math.floor(Date.now() / 1000) - 301,
      }),
    );

    expect(response.status).toBe(401);
    expect(prisma.maintenanceRun.create).not.toHaveBeenCalled();
    expect(runRegistrationMaintenance).not.toHaveBeenCalled();
  });

  it("runs maintenance once for a valid signed request", async () => {
    const expectedRunKey = new Date().toISOString().slice(0, 10);
    const response = await cronRoute.POST(makeSignedRequest());

    expect(response.status).toBe(200);
    expect(prisma.maintenanceRun.create).toHaveBeenCalledWith({
      data: {
        jobName: "registration-and-progress-maintenance",
        runKey: expectedRunKey,
        status: MaintenanceRunStatus.RUNNING,
      },
      select: { id: true },
    });
    expect(runRegistrationMaintenance).toHaveBeenCalledTimes(1);
    expect(markOverdueProgressReports).toHaveBeenCalledTimes(1);
    expect(prisma.maintenanceRun.update).toHaveBeenCalledWith({
      where: { id: "maintenance-run-1" },
      data: expect.objectContaining({
        status: MaintenanceRunStatus.COMPLETED,
        result: {
          lapsedCount: 2,
          reminderCount: 3,
          overdueProgressReports: 4,
          uploadMaintenance: {
            expiredSessionCount: 0,
            deletedObjectCount: 0,
          },
        },
      }),
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      runKey: expectedRunKey,
      lapsedCount: 2,
      reminderCount: 3,
      overdueProgressReports: 4,
      uploadMaintenance: {
        expiredSessionCount: 0,
        deletedObjectCount: 0,
      },
    });
  });

  it("rejects a replayed run key without duplicate work", async () => {
    vi.mocked(prisma.maintenanceRun.create).mockRejectedValueOnce({
      code: "P2002",
    });

    const response = await cronRoute.POST(makeSignedRequest());

    expect(response.status).toBe(409);
    expect(runRegistrationMaintenance).not.toHaveBeenCalled();
    expect(markOverdueProgressReports).not.toHaveBeenCalled();
  });

  it("rejects a caller-chosen run key that does not match the signed UTC day", async () => {
    const response = await cronRoute.POST(
      makeSignedRequest({ runKey: "fresh-key-for-the-same-retry" }),
    );

    expect(response.status).toBe(401);
    expect(prisma.maintenanceRun.create).not.toHaveBeenCalled();
    expect(runRegistrationMaintenance).not.toHaveBeenCalled();
  });
});
