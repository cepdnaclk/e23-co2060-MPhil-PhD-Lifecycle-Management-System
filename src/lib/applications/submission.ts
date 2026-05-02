import {
  ApplicationStatus,
  AcademicStatus,
  DocumentType,
  RegistrationStatus,
  UserRole,
} from "@prisma/client";

import {
  notifyApplicationSubmittedToAdministrator,
  notifyWelcomeAccountCreated,
} from "@/lib/email";
import {
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  setCustomClaimsForUser,
} from "@/lib/firebase/admin";
import { assertValidApplicationStatusTransition } from "@/lib/prisma/application-status";
import { prisma } from "@/lib/prisma/client";
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
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 413 | 500 = 400) {
    super(message);
    this.name = "ApplicationSubmissionError";
    this.status = status;
  }
}

function buildStudentTemporaryPassword(length = 18) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return password;
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
    const storagePath = assertValidApplicationUploadFile(parsed.data);
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
    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }

    throw error;
  }
}

export async function uploadApplicationDocument(input: {
  draftId: string;
  file: FormDataEntryValue | null;
}) {
  const file = input.file;

  if (!(file instanceof File)) {
    throw new ApplicationSubmissionError("A PDF document is required.", 400);
  }

  const storagePath = assertValidApplicationUploadFile({
    draftId: input.draftId,
    fileName: file.name,
    contentType: file.type,
    fileSizeBytes: file.size,
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadBufferToStorage(storagePath, buffer, file.type);

    return {
      storagePath,
      fileName: file.name,
      mimeType: "application/pdf" as const,
      sizeBytes: file.size,
    };
  } catch (error) {
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
    const normalizedStoragePath = normalizeStoragePath(parsed.data.storagePath);

    if (!normalizedStoragePath.startsWith("applications/")) {
      throw new ApplicationSubmissionError(
        "Application documents must be uploaded to the applications directory.",
        400,
      );
    }

    if (getStorageObjectOwnerId(normalizedStoragePath) !== parsed.data.draftId) {
      throw new ApplicationSubmissionError(
        "Document removal denied for this draft.",
        403,
      );
    }

    await deleteFile(normalizedStoragePath);
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      throw error;
    }

    if (error instanceof StorageAccessError) {
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

  try {
    for (const document of parsed.data.supportingDocuments) {
      assertApplicationAttachmentConstraints({
        contentType: document.mimeType,
        fileSizeBytes: document.sizeBytes,
        path: document.storagePath,
      });
    }
  } catch (error) {
    if (error instanceof StorageAccessError) {
      throw new ApplicationSubmissionError(error.message, error.status);
    }

    throw error;
  }

  const existingApplication = await prisma.application.findFirst({
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

  const application = await prisma.application.create({
    data: {
      applicantName: parsed.data.applicantName,
      applicantEmail: parsed.data.applicantEmail,
      applicantPhone: parsed.data.applicantPhone,
      researchArea: parsed.data.researchArea,
      statementOfPurpose: parsed.data.statementOfPurpose,
      status: ApplicationStatus.SUBMITTED,
      programType: parsed.data.programType,
      documents: {
        create: parsed.data.supportingDocuments.map((document) => ({
          documentType: DocumentType.APPLICATION_ATTACHMENT,
          fileName: document.fileName,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
        })),
      },
    },
    include: {
      documents: true,
    },
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

  const temporaryPassword = buildStudentTemporaryPassword();
  const firebaseUser = await createFirebaseAuthUser({
    email: application.applicantEmail,
    password: temporaryPassword,
    displayName: application.applicantName,
    disabled: false,
  });

  try {
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
      temporaryPassword,
      loginUrl: buildLoginUrl(),
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
