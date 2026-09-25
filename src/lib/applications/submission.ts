import { randomUUID } from "node:crypto";

import {
  AcademicStatus,
  ApplicationStatus,
  DocumentVerificationStatus,
  DocumentType,
  RegistrationStatus,
  UploadFileStatus,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";

import {
  buildWelcomeAccountTemplate,
  notifyApplicationSubmittedToAdministrator,
} from "@/lib/email";
import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  generateFirebasePasswordSetupLink,
  setCustomClaimsForUser,
} from "@/lib/firebase/admin";
import { assertValidApplicationStatusTransition } from "@/lib/prisma/application-status";
import { prisma } from "@/lib/prisma/client";
import { processOutboxMessage } from "@/lib/outbox/service";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import { buildProgrammeSchedule } from "@/lib/programmes/rules";
import type { AuthenticatedUserContext } from "@/types/auth";
import {
  assertApplicationAttachmentConstraints,
  buildApplicationAttachmentStoragePath,
  deleteFile,
  generateUploadSignedUrl,
  getStorageObjectOwnerId,
  normalizeStoragePath,
  sanitizeFileName,
  StorageAccessError,
} from "@/lib/storage";
import {
  PublicDraftCapabilityError,
  requirePublicApplicationDraft,
} from "@/lib/uploads/capabilities";
import {
  assertUploadVerificationConfigured,
  UploadVerificationError,
  verifyStagedUploadFile,
  type VerifiedUploadFile,
} from "@/lib/uploads/verification";

import {
  applicationDocumentDeleteRequestSchema,
  applicationSubmissionSchema,
  applicationUploadRequestSchema,
  applicationUploadVerificationRequestSchema,
  ApplicationDocumentDeleteRequest,
  ApplicationSubmissionInput,
  ApplicationUploadRequest,
  ApplicationUploadVerificationRequest,
} from "@/lib/applications/schemas";

export {
  applicationDocumentDeleteRequestSchema,
  applicationSubmissionSchema,
  applicationUploadRequestSchema,
  applicationUploadVerificationRequestSchema,
};

export class ApplicationSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 503;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 503 = 400,
  ) {
    super(message);
    this.name = "ApplicationSubmissionError";
    this.status = status;
  }
}

function buildLoginUrl() {
  return process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/login`
    : "http://localhost:3000/login";
}

export function assertValidApplicationUploadFile(input: {
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  draftId: string;
}) {
  const storagePath = buildApplicationAttachmentStoragePath(
    input.draftId,
    input.fileName,
  );

  assertApplicationAttachmentConstraints({
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    path: storagePath,
  });

  return storagePath;
}

export async function createApplicationUploadUrl(
  input: ApplicationUploadRequest,
) {
  const parsed = applicationUploadRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ApplicationSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid upload request.",
      400,
    );
  }

  let stagedFileId: string | null = null;

  try {
    const draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
    );
    if (draft.files.length >= 10) {
      throw new ApplicationSubmissionError(
        "A maximum of 10 supporting documents can be uploaded.",
        409,
      );
    }
    assertUploadVerificationConfigured();
    const fileId = randomUUID();
    const storagePath = normalizeStoragePath(
      `applications/${draft.id}/staged/${fileId}/${sanitizeFileName(parsed.data.fileName)}`,
    );
    assertApplicationAttachmentConstraints({
      contentType: parsed.data.contentType,
      fileSizeBytes: parsed.data.fileSizeBytes,
      path: storagePath,
    });
    await prisma.stagedUploadFile.create({
      data: {
        id: fileId,
        uploadSessionId: draft.id,
        ordinal: draft.files.length,
        fileName: parsed.data.fileName,
        expectedMimeType: parsed.data.contentType,
        expectedSizeBytes: parsed.data.fileSizeBytes,
        storagePath,
      },
    });
    stagedFileId = fileId;
    const signedUrl = await generateUploadSignedUrl(
      storagePath,
      parsed.data.contentType,
    );

    return {
      storagePath,
      signedUrl,
      expiresInMinutes: 15,
    };
  } catch (error) {
    if (stagedFileId) {
      await prisma.stagedUploadFile.deleteMany({
        where: { id: stagedFileId, documentId: null },
      });
    }
    if (error instanceof ApplicationSubmissionError) {
      throw error;
    }
    if (error instanceof PublicDraftCapabilityError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    if (error instanceof UploadVerificationError) {
      throw new ApplicationSubmissionError(
        "Document safety scanning is temporarily unavailable. Please try again later.",
        503,
      );
    }

    throw error;
  }
}

async function discardFailedApplicationUpload(input: {
  stagedFileId: string;
  storagePath: string;
}) {
  const cleanupResults = await Promise.allSettled([
    deleteFile(input.storagePath),
    prisma.stagedUploadFile.deleteMany({
      where: { id: input.stagedFileId, documentId: null },
    }),
  ]);

  for (const result of cleanupResults) {
    if (result.status === "rejected") {
      console.error("Failed to clean up a rejected application upload.", {
        stagedFileId: input.stagedFileId,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown cleanup error",
      });
    }
  }
}

export async function verifyApplicationDocument(
  input: ApplicationUploadVerificationRequest,
) {
  const parsed = applicationUploadVerificationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid upload verification request.",
      400,
    );
  }

  let stagedFile: Awaited<
    ReturnType<typeof requirePublicApplicationDraft>
  >["files"][number] | null = null;

  try {
    const draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
    );
    const storagePath = normalizeStoragePath(parsed.data.storagePath);

    if (getStorageObjectOwnerId(storagePath) !== draft.id) {
      throw new ApplicationSubmissionError(
        "Document verification denied for this draft.",
        403,
      );
    }

    stagedFile =
      draft.files.find((candidate) => candidate.storagePath === storagePath) ??
      null;
    if (!stagedFile || stagedFile.documentId) {
      throw new ApplicationSubmissionError(
        "The staged application document was not found.",
        404,
      );
    }

    if (
      stagedFile.status === UploadFileStatus.VERIFIED &&
      stagedFile.actualMimeType &&
      stagedFile.actualSizeBytes
    ) {
      return {
        storagePath: stagedFile.storagePath,
        fileName: stagedFile.fileName,
        mimeType: stagedFile.actualMimeType,
        sizeBytes: stagedFile.actualSizeBytes,
      };
    }
    if (stagedFile.status !== UploadFileStatus.PENDING) {
      throw new ApplicationSubmissionError(
        "This document upload can no longer be verified. Upload the file again.",
        409,
      );
    }

    const verified = await verifyStagedUploadFile(stagedFile);
    await prisma.stagedUploadFile.update({
      where: { id: stagedFile.id },
      data: {
        actualMimeType: verified.mimeType,
        actualSizeBytes: verified.sizeBytes,
        actualSha256: verified.checksumSha256,
        status: UploadFileStatus.VERIFIED,
        malwareScanStatus: verified.malwareScanStatus,
        verifiedAt: new Date(),
      },
    });

    return {
      storagePath: stagedFile.storagePath,
      fileName: stagedFile.fileName,
      mimeType: verified.mimeType,
      sizeBytes: verified.sizeBytes,
    };
  } catch (error) {
    if (
      stagedFile &&
      !(error instanceof ApplicationSubmissionError)
    ) {
      await discardFailedApplicationUpload({
        stagedFileId: stagedFile.id,
        storagePath: stagedFile.storagePath,
      });
    }
    if (error instanceof ApplicationSubmissionError) {
      throw error;
    }
    if (error instanceof PublicDraftCapabilityError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    if (error instanceof UploadVerificationError) {
      throw new ApplicationSubmissionError(error.message, 409);
    }
    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }

    throw new ApplicationSubmissionError(
      error instanceof Error ? error.message : "Unable to upload the document.",
      500,
    );
  }
}

export async function deleteUploadedApplicationDocument(
  input: ApplicationDocumentDeleteRequest,
) {
  const parsed = applicationDocumentDeleteRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ApplicationSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid document removal request.",
      400,
    );
  }

  try {
    const draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
    );
    const normalizedStoragePath = normalizeStoragePath(parsed.data.storagePath);

    if (!normalizedStoragePath.startsWith("applications/")) {
      throw new ApplicationSubmissionError(
        "Application documents must be uploaded to the applications directory.",
        400,
      );
    }

    if (getStorageObjectOwnerId(normalizedStoragePath) !== draft.id) {
      throw new ApplicationSubmissionError(
        "Document removal denied for this draft.",
        403,
      );
    }

    await deleteFile(normalizedStoragePath);
    await prisma.stagedUploadFile.deleteMany({
      where: {
        uploadSessionId: draft.id,
        storagePath: normalizedStoragePath,
        documentId: null,
      },
    });
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      throw error;
    }

    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    if (error instanceof PublicDraftCapabilityError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }

    throw new ApplicationSubmissionError(
      error instanceof Error ? error.message : "Unable to remove the document.",
      500,
    );
  }
}

export async function createApplicationSubmission(
  input: ApplicationSubmissionInput,
) {
  const parsed = applicationSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ApplicationSubmissionError(
      parsed.error.issues[0]?.message ?? "Invalid application submission.",
      400,
    );
  }

  let draft;
  try {
    draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
      { allowFinalized: true },
    );
  } catch (error) {
    if (error instanceof PublicDraftCapabilityError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    throw error;
  }

  if (
    draft.status === UploadSessionStatus.FINALIZED &&
    draft.finalizedEntityId
  ) {
    return prisma.application.findUniqueOrThrow({
      where: { id: draft.finalizedEntityId },
      include: { documents: true },
    });
  }

  const proposedSupervisor = await prisma.supervisor.findUnique({
    where: { id: parsed.data.proposedSupervisorId },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (!proposedSupervisor?.user.isActive) {
    throw new ApplicationSubmissionError(
      "The selected proposed supervisor is not available.",
      409,
    );
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: { id: draft.id, status: UploadSessionStatus.OPEN },
    data: { status: UploadSessionStatus.FINALIZING },
  });
  if (claimed.count !== 1) {
    throw new ApplicationSubmissionError(
      "Application draft is already being finalized.",
      409,
    );
  }

  const verifiedFiles: VerifiedUploadFile[] = [];
  try {
    for (const file of draft.files) {
      const verified =
        file.status === UploadFileStatus.VERIFIED &&
        file.actualMimeType &&
        file.actualSizeBytes &&
        file.actualSha256
          ? {
              id: file.id,
              ordinal: file.ordinal,
              fileName: file.fileName,
              storagePath: file.storagePath,
              mimeType: file.actualMimeType as "application/pdf" | "application/zip",
              sizeBytes: file.actualSizeBytes,
              checksumSha256: file.actualSha256,
              malwareScanStatus: file.malwareScanStatus,
            }
          : await verifyStagedUploadFile(file);
      verifiedFiles.push(verified);
      await prisma.stagedUploadFile.update({
        where: { id: file.id },
        data: {
          actualMimeType: verified.mimeType,
          actualSizeBytes: verified.sizeBytes,
          actualSha256: verified.checksumSha256,
          status: UploadFileStatus.VERIFIED,
          malwareScanStatus: verified.malwareScanStatus,
          verifiedAt: new Date(),
        },
      });
    }

    if (verifiedFiles.length < 1 || verifiedFiles.length > 10) {
      throw new ApplicationSubmissionError(
        "Application drafts require between 1 and 10 verified documents.",
        409,
      );
    }

    const claimedPaths = new Set(
      parsed.data.supportingDocuments.map((document) =>
        normalizeStoragePath(document.storagePath),
      ),
    );
    if (
      claimedPaths.size !== verifiedFiles.length ||
      verifiedFiles.some((file) => !claimedPaths.has(file.storagePath))
    ) {
      throw new ApplicationSubmissionError(
        "Application documents do not match the protected draft.",
        409,
      );
    }

    const applicationId = await withSerializableRetry(async (tx) => {
      const existingApplication = await tx.application.findFirst({
        where: {
          applicantEmail: parsed.data.applicantEmail,
          status: {
            in: [ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW],
          },
          isArchived: false,
        },
        select: { id: true },
      });
      if (existingApplication) {
        throw new ApplicationSubmissionError(
          "An active application already exists for this email address.",
          409,
        );
      }

      const documentIds = verifiedFiles.map(() => randomUUID());
      const proposalVersionId = randomUUID();
      const application = await tx.application.create({
        data: {
          applicantName: parsed.data.applicantName,
          applicantEmail: parsed.data.applicantEmail,
          applicantPhone: parsed.data.applicantPhone,
          supervisor: parsed.data.supervisor,
          researchArea: parsed.data.researchArea,
          statementOfPurpose: parsed.data.statementOfPurpose,
          status: ApplicationStatus.SUBMITTED,
          programType: parsed.data.programType,
          studyMode: parsed.data.studyMode,
          proposalTitle: parsed.data.proposalTitle,
          proposalAbstract: parsed.data.proposalAbstract,
          proposedSupervisorId: proposedSupervisor.id,
          proposedSupervisorUserId: proposedSupervisor.userId,
          proposalVersions: {
            create: {
              id: proposalVersionId,
              versionNumber: 1,
              title: parsed.data.proposalTitle,
              abstract: parsed.data.proposalAbstract,
              isCurrent: true,
            },
          },
          documents: {
            create: verifiedFiles.map((document, index) => ({
              id: documentIds[index],
              documentType: DocumentType.PROPOSAL,
              applicationProposalVersionId: proposalVersionId,
              fileName: document.fileName,
              storagePath: document.storagePath,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              checksumSha256: document.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: new Date(),
            })),
          },
        },
        select: { id: true },
      });

      for (const [index, file] of verifiedFiles.entries()) {
        await tx.stagedUploadFile.update({
          where: { id: file.id },
          data: { documentId: documentIds[index] },
        });
      }
      await tx.uploadSession.update({
        where: { id: draft.id },
        data: {
          status: UploadSessionStatus.FINALIZED,
          finalizedAt: new Date(),
          finalizedEntityId: application.id,
          result: { applicationId: application.id },
        },
      });

      await appendLifecycleEventAndEnqueue(
        tx as never,
        {
          eventKey: `application:${application.id}:submitted`,
          eventType: LIFECYCLE_EVENT.APPLICATION_SUBMITTED,
          aggregateType: "Application",
          aggregateId: application.id,
          actorLabel: parsed.data.applicantEmail,
          newState: ApplicationStatus.SUBMITTED,
          metadata: {
            programType: parsed.data.programType,
            studyMode: parsed.data.studyMode,
          },
        },
        [
          {
            eventKey: `application:${application.id}:supervisor-consent:notify:${proposedSupervisor.userId}`,
            recipientId: proposedSupervisor.userId,
            notificationEvent: "APPLICATION_STATUS_CHANGED",
            title: "Proposed supervisor consent requested",
            message: `${parsed.data.applicantName} named you as proposed supervisor for "${parsed.data.proposalTitle}".`,
            actionUrl: "/dashboard/supervisor/applications",
          },
        ],
      );
      return application.id;
    });

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { documents: true },
    });

    const administrators = await prisma.user.findMany({
    where: {
      role: UserRole.ADMINISTRATOR,
      isActive: true,
      email: {
        not: "",
      },
    },
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  });

    await Promise.all(
    administrators.map((administrator) =>
      notifyApplicationSubmittedToAdministrator({
        recipientUserId: administrator.id,
        to: administrator.email,
        administratorName: administrator.displayName,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        programTypeLabel: application.programType,
        researchArea: application.researchArea ?? "Not specified",
      }),
    ),
    );

    return application;
  } catch (error) {
    await prisma.uploadSession.updateMany({
      where: { id: draft.id, status: UploadSessionStatus.FINALIZING },
      data: {
        status: UploadSessionStatus.OPEN,
        failureReason:
          error instanceof Error ? error.message.slice(0, 1000) : "Finalization failed.",
      },
    });
    throw error;
  }
}

export async function updateApplicationStatus(
  applicationId: string,
  nextStatus: ApplicationStatus,
) {
  const application = await prisma.application.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      status: true,
      applicantName: true,
      applicantEmail: true,
      programType: true,
      studentId: true,
    },
  });

  if (!application) {
    throw new ApplicationSubmissionError("Application not found.", 404);
  }

  try {
    assertValidApplicationStatusTransition(application.status, nextStatus);
  } catch (error) {
    throw new ApplicationSubmissionError(
      error instanceof Error
        ? error.message
        : "Invalid application status transition.",
      400,
    );
  }

  if (nextStatus === ApplicationStatus.ADMITTED) {
    throw new ApplicationSubmissionError(
      "Admission must be executed through the approved Department admission route.",
      410,
    );
  }

  return prisma.application.update({
    where: { id: applicationId },
    data: { status: nextStatus },
  });
}

export async function executeApprovedAdmission(
  applicationId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new ApplicationSubmissionError(
      "Only the PG Coordinator can execute an approved admission.",
      403,
    );
  }

  const adminProfile = await prisma.administrator?.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicantName: true,
      applicantEmail: true,
      programType: true,
      studyMode: true,
      departmentDecision: true,
      studentId: true,
      proposedSupervisorId: true,
      proposedSupervisorUserId: true,
    },
  });

  if (!application) {
    throw new ApplicationSubmissionError("Application not found.", 404);
  }

  if (application.departmentDecision !== "APPROVED") {
    throw new ApplicationSubmissionError(
      "HOD approval is required before admission execution.",
      409,
    );
  }

  if (application.studentId) {
    return prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: application.applicantEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new ApplicationSubmissionError(
      "A user account already exists for this applicant email address.",
      409,
    );
  }

  const firebaseUser = await createFirebaseAuthUser({
    email: application.applicantEmail,
    displayName: application.applicantName,
    disabled: false,
  });

  try {
    const accountSetupUrl = await generateFirebasePasswordSetupLink(
      application.applicantEmail,
      { url: buildLoginUrl() },
    );
    await setCustomClaimsForUser(firebaseUser.uid, UserRole.STUDENT);

    const registrationStartDate = new Date();
    const schedule = buildProgrammeSchedule({
      programType: application.programType,
      studyMode: application.studyMode,
      registrationStartDate,
    });
    const welcome = buildWelcomeAccountTemplate({
      recipientName: application.applicantName,
      roleLabel: "Student",
      accountSetupUrl,
    });

    const welcomeOutboxId = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: application.applicantEmail,
          displayName: application.applicantName,
          firebaseUid: firebaseUser.uid,
          role: UserRole.STUDENT,
          isActive: true,
        },
      });
      const student = await tx.student.create({
        data: {
          userId: createdUser.id,
          programType: application.programType,
          studyMode: application.studyMode,
          academicStatus: AcademicStatus.ACTIVE,
          enrollmentDate: registrationStartDate,
          expectedCompletionDate: schedule.registrationEndDate,
          milestones: {
            create: schedule.milestones.map((milestone) => ({
              sequenceNumber: milestone.sequenceNumber,
              dueDate: milestone.dueDate,
            })),
          },
        },
      });
      const registration = await tx.registration.create({
        data: {
          studentId: student.id,
          startDate: registrationStartDate,
          expectedCompletionDate: schedule.registrationEndDate,
          status: RegistrationStatus.ACTIVE,
        },
      });

      if (
        application.proposedSupervisorId &&
        application.proposedSupervisorUserId &&
        adminProfile
      ) {
        await tx.supervisorAssignment?.create({
          data: {
            studentId: student.id,
            supervisorId: application.proposedSupervisorId,
            supervisorUserId: application.proposedSupervisorUserId,
            isPrimary: true,
            assignedAt: registrationStartDate,
            effectiveFrom: registrationStartDate,
            assignedBy: adminProfile.id,
          },
        });
      }

      await tx.application.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.ADMITTED,
          studentId: student.id,
        },
      });
      await tx.admissionExecution.create({
        data: {
          applicationId: application.id,
          executedByUserId: auth.userId,
          studentId: student.id,
          registrationId: registration.id,
        },
      });
      const { outboxMessages } = await appendLifecycleEventAndEnqueue(
        tx as never,
        {
          eventKey: `application:${application.id}:admission-executed`,
          eventType: LIFECYCLE_EVENT.ADMISSION_EXECUTED,
          aggregateType: "Application",
          aggregateId: application.id,
          actorUserId: auth.userId,
          actorRole: auth.role,
          previousState: ApplicationStatus.UNDER_REVIEW,
          newState: ApplicationStatus.ADMITTED,
          metadata: {
            studentId: student.id,
            registrationId: registration.id,
            durationMonths: schedule.rule.durationMonths,
          },
        },
        [
          {
            eventKey: `application:${application.id}:admission-executed:welcome`,
            recipientId: createdUser.id,
            studentId: student.id,
            notificationEvent: "APPLICATION_STATUS_CHANGED",
            title: "Admission executed",
            message: `Your ${application.programType} admission has been executed.`,
            actionUrl: "/dashboard/student",
            payload: {
              email: {
                to: application.applicantEmail,
                ...welcome,
              },
            },
          },
        ],
      );

      return outboxMessages[0]?.id ?? null;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });

    if (welcomeOutboxId) {
      await processOutboxMessage({
        id: welcomeOutboxId,
        workerId: `admission:${application.id}:${randomUUID()}`,
      }).catch((deliveryError) => {
        console.error(
          "Immediate admission welcome delivery failed; the outbox will retry it.",
          deliveryError,
        );
      });
    }

    return prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });
  } catch (error) {
    await deleteFirebaseAuthUser(firebaseUser.uid).catch((cleanupError) => {
      console.error("Failed to roll back Firebase student account.", cleanupError);
    });
    throw error instanceof ApplicationSubmissionError
      ? error
      : new ApplicationSubmissionError(
          error instanceof Error ? error.message : "Unable to execute admission.",
          500,
        );
  }
}
