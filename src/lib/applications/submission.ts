import { randomUUID } from "node:crypto";

import {
  AcademicStatus,
  ApplicationStatus,
  DocumentVerificationStatus,
  DocumentType,
  MalwareScanStatus,
  RegistrationStatus,
  UploadFileStatus,
  UploadSessionStatus,
  UserRole,
} from "@prisma/client";

import {
  notifyApplicationSubmittedToAdministrator,
  notifyWelcomeAccountCreated,
} from "@/lib/email";
import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  generateFirebasePasswordSetupLink,
  setCustomClaimsForUser,
} from "@/lib/firebase/admin";
import { assertValidApplicationStatusTransition } from "@/lib/prisma/application-status";
import { prisma } from "@/lib/prisma/client";
import { withSerializableRetry } from "@/lib/prisma/transactions";
import {
  assertApplicationAttachmentConstraints,
  buildApplicationAttachmentStoragePath,
  deleteFile,
  generateUploadSignedUrl,
  getStorageObjectOwnerId,
  normalizeStoragePath,
  StorageAccessError,
  uploadBufferToStorage,
} from "@/lib/storage";
import {
  PublicDraftCapabilityError,
  requirePublicApplicationDraft,
} from "@/lib/uploads/capabilities";
import {
  UploadVerificationError,
  verifyStagedUploadFile,
  type VerifiedUploadFile,
} from "@/lib/uploads/verification";

import {
  applicationDocumentDeleteRequestSchema,
  applicationSubmissionSchema,
  applicationUploadRequestSchema,
  ApplicationDocumentDeleteRequest,
  ApplicationSubmissionInput,
  ApplicationUploadRequest,
} from "@/lib/applications/schemas";

export {
  applicationDocumentDeleteRequestSchema,
  applicationSubmissionSchema,
  applicationUploadRequestSchema,
};

export class ApplicationSubmissionError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 413 | 429 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 413 | 429 | 500 = 400,
  ) {
    super(message);
    this.name = "ApplicationSubmissionError";
    this.status = status;
  }
}

function buildInitialRegistrationWindow(startDate = new Date()) {
  const expirationDate = new Date(startDate);
  expirationDate.setFullYear(expirationDate.getFullYear() + 1);

  return {
    startDate,
    expirationDate,
  };
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

  try {
    const draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
    );
    const fileId = randomUUID();
    const storagePath = normalizeStoragePath(
      `applications/${draft.id}/staged/${fileId}/${parsed.data.fileName}`,
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
    if (error instanceof PublicDraftCapabilityError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }
    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }

    throw error;
  }
}

export async function uploadApplicationDocument(input: {
  draftId: string;
  draftToken: string;
  file: FormDataEntryValue | null;
}) {
  const file = input.file;

  if (!(file instanceof File)) {
    throw new ApplicationSubmissionError("A PDF or ZIP document is required.", 400);
  }

  try {
    const draft = await requirePublicApplicationDraft(
      input.draftId,
      input.draftToken,
    );
    const fileId = randomUUID();
    const storagePath = normalizeStoragePath(
      `applications/${draft.id}/staged/${fileId}/${file.name}`,
    );
    assertApplicationAttachmentConstraints({
      contentType: file.type,
      fileSizeBytes: file.size,
      path: storagePath,
    });
    const stagedFile = await prisma.stagedUploadFile.create({
      data: {
        id: fileId,
        uploadSessionId: draft.id,
        ordinal: draft.files.length,
        fileName: file.name,
        expectedMimeType: file.type,
        expectedSizeBytes: file.size,
        storagePath,
      },
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadBufferToStorage(storagePath, buffer, file.type);
    const verified = await verifyStagedUploadFile(stagedFile);
    await prisma.stagedUploadFile.update({
      where: { id: stagedFile.id },
      data: {
        actualMimeType: verified.mimeType,
        actualSizeBytes: verified.sizeBytes,
        actualSha256: verified.checksumSha256,
        status: UploadFileStatus.VERIFIED,
        malwareScanStatus: MalwareScanStatus.CLEAN,
        verifiedAt: new Date(),
      },
    });

    return {
      storagePath,
      fileName: file.name,
      mimeType: verified.mimeType,
      sizeBytes: verified.sizeBytes,
    };
  } catch (error) {
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
          malwareScanStatus: MalwareScanStatus.CLEAN,
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
          documents: {
            create: verifiedFiles.map((document, index) => ({
              id: documentIds[index],
              documentType: DocumentType.APPLICATION_ATTACHMENT,
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

  if (nextStatus !== ApplicationStatus.ADMITTED) {
    return prisma.application.update({
      where: {
        id: applicationId,
      },
      data: {
        status: nextStatus,
      },
    });
  }

  if (application.studentId) {
    return prisma.application.update({
      where: {
        id: applicationId,
      },
      data: {
        status: nextStatus,
      },
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: application.applicantEmail,
    },
    select: {
      id: true,
    },
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
      {
        url: buildLoginUrl(),
      },
    );

    await setCustomClaimsForUser(firebaseUser.uid, "STUDENT");

    const { startDate, expirationDate } = buildInitialRegistrationWindow();

    const admittedApplication = await prisma.$transaction(async (tx) => {
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
          academicStatus: AcademicStatus.ACTIVE,
          enrollmentDate: startDate,
        },
      });

      await tx.registration.create({
        data: {
          studentId: student.id,
          startDate,
          expirationDate,
          status: RegistrationStatus.ACTIVE,
        },
      });

      await tx.application.update({
        where: {
          id: application.id,
        },
        data: {
          status: ApplicationStatus.ADMITTED,
          studentId: student.id,
        },
      });

      return {
        createdUser,
        student,
      };
    });

    void notifyWelcomeAccountCreated({
      recipientUserId: admittedApplication.createdUser.id,
      to: admittedApplication.createdUser.email,
      recipientName: admittedApplication.createdUser.displayName,
      roleLabel: admittedApplication.createdUser.role,
      accountSetupUrl,
    });

    return prisma.application.findUniqueOrThrow({
      where: {
        id: application.id,
      },
    });
  } catch (error) {
    try {
      await deleteFirebaseAuthUser(firebaseUser.uid);
    } catch (cleanupError) {
      console.error("Failed to roll back Firebase student account creation.", cleanupError);
    }

    if (error instanceof ApplicationSubmissionError) {
      throw error;
    }

    throw new ApplicationSubmissionError(
      error instanceof Error ? error.message : "Unable to admit application.",
      500,
    );
  }
}
