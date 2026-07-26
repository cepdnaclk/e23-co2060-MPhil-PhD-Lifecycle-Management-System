import {
  AcademicStatus,
  RegistrationStatus,
  UploadPurpose,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import {
  progressReportUploadRequestSchema,
  type ProgressReportUploadRequest,
} from "@/lib/progress-reports/schemas";
import {
  createStagedUploadSession,
  UploadSessionError,
} from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

export class ProgressReportUploadError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ProgressReportUploadError";
  }
}

export async function createProgressReportUploadUrl(
  input: ProgressReportUploadRequest,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new ProgressReportUploadError(
      "Only a Student can upload progress evidence.",
      403,
    );
  }
  const parsed = progressReportUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProgressReportUploadError(
      parsed.error.issues[0]?.message ?? "Invalid progress upload request.",
      400,
    );
  }
  const student = await prisma.student.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      academicStatus: true,
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
        },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!student) {
    throw new ProgressReportUploadError("Student profile not found.", 404);
  }
  if (
    student.academicStatus !== AcademicStatus.ACTIVE ||
    student.registrations.length !== 1
  ) {
    throw new ProgressReportUploadError(
      "An active Student record and fixed-term registration are required.",
      403,
    );
  }
  try {
    return await createStagedUploadSession(
      {
        purpose: UploadPurpose.PROGRESS_REPORT,
        idempotencyKey: parsed.data.idempotencyKey,
        files: parsed.data.files,
      },
      auth,
      student.id,
    );
  } catch (error) {
    if (error instanceof UploadSessionError) {
      throw new ProgressReportUploadError(error.message, error.status);
    }
    throw error;
  }
}
