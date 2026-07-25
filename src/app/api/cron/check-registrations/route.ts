import { createHmac, timingSafeEqual } from "node:crypto";

import { MaintenanceRunStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { createServerErrorResponse } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { markOverdueProgressReports } from "@/lib/progress-reports/maintenance";
import { cleanupExpiredUploadSessions } from "@/lib/uploads/sessions";
import { runRegistrationMaintenance } from "@/lib/registrations";

export const runtime = "nodejs";

const JOB_NAME = "registration-and-progress-maintenance";
const ROUTE_PATH = "/api/cron/check-registrations";
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;
const MINIMUM_CRON_SECRET_BYTES = 32;
const RUN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

type CronAuthorizationResult =
  | { authorized: true; runKey: string }
  | { authorized: false; message: string; status: 401 | 503 };

function jsonError(message: string, status: 401 | 409 | 503) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function buildSignaturePayload(timestamp: string, runKey: string) {
  return `${timestamp}\n${runKey}\nPOST\n${ROUTE_PATH}`;
}

function authorizeCronRequest(request: Request): CronAuthorizationResult {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || Buffer.byteLength(secret, "utf8") < MINIMUM_CRON_SECRET_BYTES) {
    return {
      authorized: false,
      message: "Cron authentication is not configured securely.",
      status: 503,
    };
  }

  const timestamp = request.headers.get("x-cron-timestamp")?.trim() ?? "";
  const runKey = request.headers.get("x-cron-run-key")?.trim() ?? "";
  const signature = request.headers.get("x-cron-signature")?.trim() ?? "";
  const signatureMatch = SIGNATURE_PATTERN.exec(signature);

  if (!/^\d{10}$/.test(timestamp) || !RUN_KEY_PATTERN.test(runKey) || !signatureMatch) {
    return {
      authorized: false,
      message: "Invalid cron credentials.",
      status: 401,
    };
  }

  const requestTimeSeconds = Number(timestamp);
  const currentTimeSeconds = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(requestTimeSeconds) ||
    Math.abs(currentTimeSeconds - requestTimeSeconds) > MAX_SIGNATURE_AGE_SECONDS
  ) {
    return {
      authorized: false,
      message: "Expired cron credentials.",
      status: 401,
    };
  }

  const expectedRunKey = new Date(requestTimeSeconds * 1000)
    .toISOString()
    .slice(0, 10);

  if (runKey !== expectedRunKey) {
    return {
      authorized: false,
      message: "Invalid cron run key.",
      status: 401,
    };
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(buildSignaturePayload(timestamp, runKey), "utf8")
    .digest();
  const providedSignature = Buffer.from(signatureMatch[1], "hex");

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return {
      authorized: false,
      message: "Invalid cron credentials.",
      status: 401,
    };
  }

  return { authorized: true, runKey };
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(request: Request) {
  const authorization = authorizeCronRequest(request);

  if (!authorization.authorized) {
    return jsonError(authorization.message, authorization.status);
  }

  let run: { id: string };

  try {
    run = await prisma.maintenanceRun.create({
      data: {
        jobName: JOB_NAME,
        runKey: authorization.runKey,
        status: MaintenanceRunStatus.RUNNING,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return jsonError("This maintenance run has already been claimed.", 409);
    }

    return createServerErrorResponse({
      error,
      message: "Unable to claim the maintenance run.",
      route: ROUTE_PATH,
      method: "POST",
    });
  }

  try {
    const [
      registrationMaintenance,
      overdueProgressReports,
      uploadMaintenance,
    ] = await Promise.all([
      runRegistrationMaintenance(),
      markOverdueProgressReports(),
      cleanupExpiredUploadSessions(),
    ]);
    const result = {
      ...registrationMaintenance,
      overdueProgressReports,
      uploadMaintenance,
    };

    await prisma.maintenanceRun.update({
      where: { id: run.id },
      data: {
        status: MaintenanceRunStatus.COMPLETED,
        completedAt: new Date(),
        result,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        runKey: authorization.runKey,
        ...result,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    try {
      await prisma.maintenanceRun.update({
        where: { id: run.id },
        data: {
          status: MaintenanceRunStatus.FAILED,
          failedAt: new Date(),
          errorMessage: "Maintenance task failed.",
        },
      });
    } catch (updateError) {
      await createServerErrorResponse({
        error: updateError,
        message: "Unable to record the failed maintenance run.",
        route: ROUTE_PATH,
        method: "POST",
        metadata: { runId: run.id },
      });
    }

    return createServerErrorResponse({
      error,
      message: "Maintenance execution failed.",
      route: ROUTE_PATH,
      method: "POST",
      metadata: { runId: run.id },
    });
  }
}
