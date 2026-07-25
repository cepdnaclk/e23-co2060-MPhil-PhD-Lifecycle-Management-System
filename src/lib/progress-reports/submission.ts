import { randomUUID } from "node:crypto";

import {
  DocumentType,
  DocumentVerificationStatus,
  RegistrationStatus,
  UploadPurpose,
  UploadSessionStatus,
} from "@prisma/client";

import { notifyInBackground } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import {
  progressReportSubmissionSchema,
  progressReportUploadRequestSchema,
  type ProgressReportSubmissionInput,
  type ProgressReportUploadRequest,
} from "@/lib/progress-reports/schemas";
import {
  createStagedUploadSession,
  reopenUploadSessionAfterFinalizeFailure,
  UploadSessionError,
  verifyUploadSessionForFinalize,
  type VerifiedUploadSession,
} from "@/lib/uploads/sessions";
import type { AuthenticatedUserContext } from "@/types/auth";

export class ProgressReportSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ProgressReportSubmissionError";
    this.status = status;
  }
}

type StudentProgressReportContext = {
  id: string;
  user: {
    id: string;
    displayName: string;
  };
  registrations: Array<{
    id: string;
  }>;
  supervisorAssignments: Array<{
    supervisor: {
      user: {
        id: string;
        displayName: string;
        email: string;
        isActive: boolean;
      };
    };
  }>;
};

async function requireStudentProgressReportContext(
  auth: AuthenticatedUserContext,
): Promise<StudentProgressReportContext> {
  if (auth.role !== "STUDENT") {
    throw new ProgressReportSubmissionError(
      "Only students can submit progress reports.",
      403,
    );
  }

  const student = await prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
      registrations: {
        where: {
          status: RegistrationStatus.ACTIVE,
          expirationDate: {
            gte: new Date(),
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
      supervisorAssignments: {
        select: {
          supervisor: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!student) {
    throw new ProgressReportSubmissionError("Student profile not found.", 404);
  }

  if (student.registrations.length === 0) {
    throw new ProgressReportSubmissionError(
      "Your registration is lapsed. Renew it before submitting progress reports.",
      403,
    );
  }

  return student;
}

function notifyAssignedSupervisors(input: {
  student: StudentProgressReportContext;
  periodLabel: string;
}) {
  for (const assignment of input.student.supervisorAssignments) {
    const supervisor = assignment.supervisor.user;

    if (!supervisor.isActive || !supervisor.email) {
      continue;
    }

    notifyInBackground({
      event: "PROGRESS_REPORT_SUBMITTED",
      recipientUserId: supervisor.id,
      to: supervisor.email,
      supervisorName: supervisor.displayName,
      studentName: input.student.user.displayName,
      studentId: input.student.id,
      periodLabel: input.periodLabel,
    });
  }
}

export async function submitProgressReport(
  input: ProgressReportSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = progressReportSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProgressReportSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid progress report submission.",
      400,
    );
  }

  const student = await requireStudentProgressReportContext(auth);

  let verifiedSession: VerifiedUploadSession | null = null;
  if (parsed.data.uploadSessionId) {
    try {
      const verification = await verifyUploadSessionForFinalize(
        parsed.data.uploadSessionId,
        UploadPurpose.PROGRESS_REPORT,
        auth,
      );
      if (verification.state === "FINALIZED") {
        const existing = await prisma.progressReport.findUnique({
          where: { id: verification.finalizedEntityId },
          include: { documents: { where: { isDeleted: false } } },
        });
        if (!existing) {
          throw new ProgressReportSubmissionError(
            "Finalized progress report could not be loaded.",
            500,
          );
        }
        return { report: existing };
      }
      verifiedSession = verification.session;
    } catch (error) {
      if (error instanceof UploadSessionError) {
        throw new ProgressReportSubmissionError(error.message, error.status);
      }
      throw error;
    }
  }

  try {
    const result = await withSerializableRetry(async (tx) => {
      const reportId = randomUUID();
      const documentIds =
        verifiedSession?.files.map(() => randomUUID()) ?? [];
      const report = await tx.progressReport.create({
        data: {
          id: reportId,
          studentId: student.id,
          periodLabel: parsed.data.periodLabel,
          narrative: parsed.data.narrative,
          isOverdue: false,
        },
        select: {
          id: true,
          studentId: true,
          periodLabel: true,
          narrative: true,
          isSupervisorSignedOff: true,
          isOverdue: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!verifiedSession) {
        return {
          report,
          documents: [],
        };
      }

      const documents = await Promise.all(
        verifiedSession.files.map((document, index) =>
          tx.document.create({
            data: {
              id: documentIds[index],
              documentType: DocumentType.PROGRESS_REPORT,
              studentId: student.id,
              progressReportId: report.id,
              fileName: document.fileName,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              checksumSha256: document.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: new Date(),
              version: 1,
              isCurrentVersion: true,
            },
            select: {
              id: true,
              fileName: true,
              storagePath: true,
              mimeType: true,
              version: true,
              isCurrentVersion: true,
              createdAt: true,
            },
          }),
        ),
      );

      for (const [index, file] of verifiedSession.files.entries()) {
        await tx.stagedUploadFile.update({
          where: { id: file.id },
          data: { documentId: documentIds[index] },
        });
      }
      await tx.uploadSession.update({
        where: { id: verifiedSession.id },
        data: {
          status: UploadSessionStatus.FINALIZED,
          finalizedAt: new Date(),
          finalizedEntityId: report.id,
          result: { documentCount: documents.length },
        },
      });

      return {
        report,
        documents,
      };
    });

    notifyAssignedSupervisors({
      student,
      periodLabel: result.report.periodLabel,
    });

    return {
      report: {
        ...result.report,
        documents: result.documents,
      },
    };
  } catch (error) {
    if (verifiedSession) {
      await reopenUploadSessionAfterFinalizeFailure(
        verifiedSession.id,
        error instanceof Error ? error.message : "Progress finalization failed.",
      );
    }
    if (error instanceof ProgressReportSubmissionError) {
      throw error;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new ProgressReportSubmissionError(
        "A progress report for this period already exists.",
        409,
      );
    }

    throw new ProgressReportSubmissionError(
      error instanceof Error ? error.message : "Unable to submit progress report.",
      500,
    );
  }
}

export async function createProgressReportUploadUrl(
  input: ProgressReportUploadRequest,
  auth: AuthenticatedUserContext,
) {
  const parsed = progressReportUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProgressReportSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid progress upload request.",
      400,
    );
  }
  const student = await requireStudentProgressReportContext(auth);
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
      throw new ProgressReportSubmissionError(error.message, error.status);
    }
    throw error;
  }
}
