import { createHash } from "node:crypto";

import { AcademicStatus, DocumentType, UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  normalizeStoragePath,
  StorageAccessError,
} from "@/lib/storage";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_STORAGE_FILE_SIZE_BYTES,
} from "@/lib/validation/uploads";
import { sanitizedString } from "@/lib/validation/schemas";
import type { AuthenticatedUserContext } from "@/types/auth";

const reviewAttachmentSchema = z.object({
  fileName: sanitizedString.min(1, "Attachment file name is required."),
  storagePath: sanitizedString.min(1, "Attachment storage path is required."),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_STORAGE_FILE_SIZE_BYTES),
});

export const progressReportReviewAssignmentSchema = z.object({
  progressReportId: z.string().min(1, "Progress report id is required."),
  examinerId: z.string().min(1, "Examiner id is required."),
});

export const progressReportReviewSubmissionSchema = z
  .object({
    reviewText: sanitizedString.min(1, "Review text is required.").max(10000),
    document: reviewAttachmentSchema.optional(),
    documents: z.array(reviewAttachmentSchema).max(10).optional(),
  })
  .transform((value) => ({
    ...value,
    documents: value.documents?.length
      ? value.documents
      : value.document
        ? [value.document]
        : [],
  }));

export const progressReportAdminReviewReleaseSchema = z.object({
  adminComments: z.string().trim().max(10000).optional().nullable(),
  release: z.boolean().default(true),
});

export type ProgressReportReviewAssignmentInput = z.infer<
  typeof progressReportReviewAssignmentSchema
>;
export type ProgressReportReviewSubmissionInput = z.infer<
  typeof progressReportReviewSubmissionSchema
>;
export type ProgressReportAdminReviewReleaseInput = z.infer<
  typeof progressReportAdminReviewReleaseSchema
>;

export class ProgressReportReviewError extends Error {
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ProgressReportReviewError";
    this.status = status;
  }
}

async function requireAdministrator(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new ProgressReportReviewError("Only administrators can manage examiner assignments.", 403);
  }

  const administrator = await prisma.administrator.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      user: {
        select: {
          displayName: true,
        },
      },
    },
  });

  if (!administrator) {
    throw new ProgressReportReviewError("Administrator profile not found.", 404);
  }

  return administrator;
}

async function requireExaminerById(examinerId: string) {
  const examiner = await prisma.examiner.findUnique({
    where: { id: examinerId },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          isActive: true,
        },
      },
    },
  });

  if (!examiner) {
    throw new ProgressReportReviewError("Examiner not found.", 404);
  }

  if (!examiner.user.isActive) {
    throw new ProgressReportReviewError("Examiner account is inactive.", 409);
  }

  return examiner;
}

async function requireExaminer(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.EXAMINER) {
    throw new ProgressReportReviewError("Only examiners can submit reviews.", 403);
  }

  const examiner = await prisma.examiner.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!examiner) {
    throw new ProgressReportReviewError("Examiner profile not found.", 404);
  }

  return examiner;
}

async function requireProgressReport(progressReportId: string) {
  const report = await prisma.progressReport.findUnique({
    where: { id: progressReportId },
    select: {
      id: true,
      periodLabel: true,
      studentId: true,
      student: {
        select: {
          academicStatus: true,
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          supervisorAssignments: {
            select: {
              supervisorUserId: true,
            },
          },
        },
      },
      documents: {
        where: { isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          storagePath: true,
          checksumSha256: true,
        },
      },
    },
  });

  if (!report) {
    throw new ProgressReportReviewError("Progress report not found.", 404);
  }

  return report;
}

function assertNotGraduated(academicStatus: AcademicStatus) {
  if (academicStatus === AcademicStatus.GRADUATED) {
    throw new ProgressReportReviewError(
      "Graduated student records are read-only for examiners.",
      403,
    );
  }
}

function assertNoSupervisorConflict(
  report: Awaited<ReturnType<typeof requireProgressReport>>,
  examinerUserId: string,
) {
  const isAssignedSupervisor = report.student.supervisorAssignments.some(
    (assignment) => assignment.supervisorUserId === examinerUserId,
  );

  if (isAssignedSupervisor) {
    throw new ProgressReportReviewError(
      "Assigned supervisors cannot be examiners for this student's progress report.",
      403,
    );
  }
}

function assertReviewAttachment(input: {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const normalizedPath = normalizeStoragePath(input.storagePath);

  if (!normalizedPath.startsWith("review-attachments/")) {
    throw new ProgressReportReviewError(
      "Review attachments must be uploaded to the review-attachments directory.",
      400,
    );
  }

  try {
    assertFileUploadConstraints({
      contentType: input.mimeType,
      fileSizeBytes: input.sizeBytes,
      path: normalizedPath,
    });
  } catch (error) {
    if (error instanceof StorageAccessError) {
      throw new ProgressReportReviewError(error.message, error.status);
    }

    throw error;
  }
}

export async function assignExaminerToProgressReport(
  input: ProgressReportReviewAssignmentInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = progressReportReviewAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProgressReportReviewError(
      parsed.error.issues[0]?.message ?? "Invalid examiner assignment payload.",
      400,
    );
  }

  const [administrator, report, examiner] = await Promise.all([
    requireAdministrator(auth),
    requireProgressReport(parsed.data.progressReportId),
    requireExaminerById(parsed.data.examinerId),
  ]);

  assertNotGraduated(report.student.academicStatus);
  assertNoSupervisorConflict(report, examiner.userId);

  try {
    const evidenceManifestHash = createHash("sha256")
      .update(
        JSON.stringify(
          report.documents.map((document) => ({
            id: document.id,
            storagePath: document.storagePath,
            checksumSha256: document.checksumSha256,
          })),
        ),
      )
      .digest("hex");

    return await prisma.progressReportReview.create({
      data: {
        progressReportId: report.id,
        examinerId: examiner.id,
        examinerUserId: examiner.userId,
        assignedBy: administrator.id,
        evidenceManifestHash,
      },
      select: {
        id: true,
        progressReportId: true,
        examinerId: true,
        examinerUserId: true,
        assignedAt: true,
        reviewText: true,
        submittedAt: true,
        adminComments: true,
        releasedAt: true,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new ProgressReportReviewError(
        "This examiner is already assigned to the selected progress report.",
        409,
      );
    }

    throw error;
  }
}

export async function submitProgressReportReview(
  reviewId: string,
  input: ProgressReportReviewSubmissionInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = progressReportReviewSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProgressReportReviewError(
      parsed.error.issues[0]?.message ?? "Invalid progress report review.",
      400,
    );
  }

  const examiner = await requireExaminer(auth);
  const review = await prisma.progressReportReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      examinerId: true,
      reviewText: true,
      submittedAt: true,
      progressReport: {
        select: {
          studentId: true,
          student: {
            select: {
              academicStatus: true,
            },
          },
        },
      },
    },
  });

  if (!review) {
    throw new ProgressReportReviewError("Review assignment not found.", 404);
  }

  if (review.examinerId !== examiner.id) {
    throw new ProgressReportReviewError("Forbidden.", 403);
  }

  assertNotGraduated(review.progressReport.student.academicStatus);

  if (review.submittedAt) {
    throw new ProgressReportReviewError("This review has already been submitted.", 409);
  }

  for (const document of parsed.data.documents) {
    assertReviewAttachment({
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    });
  }

  return prisma.progressReportReview.update({
    where: { id: review.id },
    data: {
      reviewText: parsed.data.reviewText,
      submittedAt: new Date(),
      documents: {
        create: parsed.data.documents.map((document) => ({
          documentType: DocumentType.REVIEW_ATTACHMENT,
          studentId: review.progressReport.studentId,
          fileName: document.fileName,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
          version: 1,
          isCurrentVersion: true,
        })),
      },
    },
    select: {
      id: true,
      progressReportId: true,
      examinerId: true,
      reviewText: true,
      submittedAt: true,
      adminComments: true,
      releasedAt: true,
      documents: {
        where: {
          isDeleted: false,
        },
        select: {
          id: true,
          fileName: true,
          storagePath: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function releaseProgressReportReview(
  reviewId: string,
  input: ProgressReportAdminReviewReleaseInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = progressReportAdminReviewReleaseSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProgressReportReviewError(
      parsed.error.issues[0]?.message ?? "Invalid admin review release payload.",
      400,
    );
  }

  await requireAdministrator(auth);

  const review = await prisma.progressReportReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      submittedAt: true,
    },
  });

  if (!review) {
    throw new ProgressReportReviewError("Review assignment not found.", 404);
  }

  if (!review.submittedAt) {
    throw new ProgressReportReviewError("The examiner review must be submitted before release.", 409);
  }

  return prisma.progressReportReview.update({
    where: { id: review.id },
    data: {
      adminComments: parsed.data.adminComments,
      releasedAt: parsed.data.release ? new Date() : null,
    },
    select: {
      id: true,
      progressReportId: true,
      examinerId: true,
      reviewText: true,
      submittedAt: true,
      adminComments: true,
      releasedAt: true,
    },
  });
}
