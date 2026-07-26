import {
  ApplicationStatus,
  AssignmentStatus,
  DepartmentDecision,
  DocumentType,
  DocumentVerificationStatus,
  MalwareScanStatus,
  UploadFileStatus,
  UploadSessionStatus,
} from "@prisma/client";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  appendLifecycleEventAndEnqueue,
  LIFECYCLE_EVENT,
} from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import {
  PublicDraftCapabilityError,
  requirePublicApplicationDraft,
} from "@/lib/uploads/capabilities";
import {
  UploadVerificationError,
  verifyStagedUploadFile,
  type VerifiedUploadFile,
} from "@/lib/uploads/verification";
import { sanitizedString } from "@/lib/validation/schemas";

export const applicationProposalRevisionSchema = z.object({
  revisionToken: sanitizedString.min(
    32,
    "A proposal revision capability is required.",
  ),
  draftId: z.string().uuid("A valid protected upload draft is required."),
  draftToken: sanitizedString.min(32, "A protected upload token is required."),
  title: sanitizedString.min(5).max(500),
  abstract: sanitizedString.min(20).max(20_000),
  changeSummary: sanitizedString.min(5).max(2_000),
});

type ProposalRevisionInput = z.infer<
  typeof applicationProposalRevisionSchema
>;

export class ProposalRevisionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 410 | 429 | 500 = 400,
  ) {
    super(message);
    this.name = "ProposalRevisionError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest();
}

function assertRevisionCapability(
  expectedHex: string | null,
  suppliedToken: string,
) {
  const expected = Buffer.from(expectedHex ?? "", "hex");
  const supplied = hashToken(suppliedToken);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    throw new ProposalRevisionError(
      "The proposal revision capability is invalid.",
      403,
    );
  }
}

export async function submitApplicationProposalRevision(
  applicationId: string,
  input: ProposalRevisionInput,
) {
  const parsed = applicationProposalRevisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProposalRevisionError(
      parsed.error.issues[0]?.message ?? "Invalid proposal revision.",
      400,
    );
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicantEmail: true,
      departmentDecision: true,
      status: true,
      revisionCapabilityTokenHash: true,
      revisionCapabilityExpiresAt: true,
      proposalVersions: {
        where: { isCurrent: true },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          reviewerAssignments: {
            select: {
              reviewerUserId: true,
              assignedByUserId: true,
            },
          },
        },
      },
    },
  });
  if (!application) {
    throw new ProposalRevisionError("Application not found.", 404);
  }
  assertRevisionCapability(
    application.revisionCapabilityTokenHash,
    parsed.data.revisionToken,
  );
  if (
    !application.revisionCapabilityExpiresAt ||
    application.revisionCapabilityExpiresAt <= new Date()
  ) {
    throw new ProposalRevisionError(
      "The proposal revision capability has expired.",
      410,
    );
  }
  if (
    application.departmentDecision !== DepartmentDecision.REVISION_REQUIRED ||
    application.status === ApplicationStatus.ADMITTED
  ) {
    throw new ProposalRevisionError(
      "This application is not awaiting a proposal revision.",
      409,
    );
  }
  const currentVersion = application.proposalVersions[0];
  if (!currentVersion) {
    throw new ProposalRevisionError(
      "The current application proposal version was not found.",
      409,
    );
  }

  let draft;
  try {
    draft = await requirePublicApplicationDraft(
      parsed.data.draftId,
      parsed.data.draftToken,
    );
  } catch (error) {
    if (error instanceof PublicDraftCapabilityError) {
      throw new ProposalRevisionError(error.message, error.status);
    }
    throw error;
  }
  if (draft.files.length < 1 || draft.files.length > 10) {
    throw new ProposalRevisionError(
      "Upload between one and ten proposal documents.",
      409,
    );
  }

  const claimed = await prisma.uploadSession.updateMany({
    where: { id: draft.id, status: UploadSessionStatus.OPEN },
    data: { status: UploadSessionStatus.FINALIZING },
  });
  if (claimed.count !== 1) {
    throw new ProposalRevisionError(
      "The protected upload is already being finalized.",
      409,
    );
  }

  const verifiedFiles: VerifiedUploadFile[] = [];
  try {
    for (const file of draft.files) {
      const verified = await verifyStagedUploadFile(file);
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
          rejectionReason: null,
        },
      });
    }

    const versionId = randomUUID();
    const versionNumber = currentVersion.versionNumber + 1;
    const documentIds = verifiedFiles.map(() => randomUUID());
    const reviewerUserIds = [
      ...new Set(
        currentVersion.reviewerAssignments.map(
          (assignment) => assignment.reviewerUserId,
        ),
      ),
    ];
    const assignmentIds = reviewerUserIds.map(() => randomUUID());

    const version = await prisma.$transaction(async (tx) => {
      await tx.applicationProposalVersion.updateMany({
        where: { applicationId: application.id, isCurrent: true },
        data: { isCurrent: false },
      });
      const createdVersion = await tx.applicationProposalVersion.create({
        data: {
          id: versionId,
          applicationId: application.id,
          versionNumber,
          title: parsed.data.title,
          abstract: parsed.data.abstract,
          changeSummary: parsed.data.changeSummary,
          isCurrent: true,
          documents: {
            create: verifiedFiles.map((file, index) => ({
              id: documentIds[index],
              applicationId: application.id,
              documentType: DocumentType.PROPOSAL,
              fileName: file.fileName,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              checksumSha256: file.checksumSha256,
              verificationStatus: DocumentVerificationStatus.VERIFIED,
              verifiedAt: new Date(),
              version: versionNumber,
              isCurrentVersion: true,
            })),
          },
        },
      });
      await tx.document.updateMany({
        where: {
          applicationId: application.id,
          applicationProposalVersionId: { not: versionId },
        },
        data: { isCurrentVersion: false },
      });
      if (reviewerUserIds.length > 0) {
        await tx.proposalReviewerAssignment.createMany({
          data: reviewerUserIds.map((reviewerUserId, index) => ({
            id: assignmentIds[index],
            applicationId: application.id,
            proposalVersionId: versionId,
            reviewerUserId,
            assignedByUserId:
              currentVersion.reviewerAssignments[0]?.assignedByUserId ??
              reviewerUserId,
            status: AssignmentStatus.PENDING,
          })),
        });
      }
      await tx.application.update({
        where: { id: application.id },
        data: {
          proposalTitle: parsed.data.title,
          proposalAbstract: parsed.data.abstract,
          status: ApplicationStatus.UNDER_REVIEW,
          departmentDecision: DepartmentDecision.PENDING,
          hodDecisionByUserId: null,
          hodDecisionAt: null,
          hodDecisionReason: null,
          revisionCapabilityTokenHash: null,
          revisionCapabilityExpiresAt: null,
        },
      });
      for (const [index, file] of draft.files.entries()) {
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
          finalizedEntityId: versionId,
          result: { applicationId: application.id, versionNumber },
        },
      });
      await appendLifecycleEventAndEnqueue(
        tx as never,
        {
          eventKey: `application:${application.id}:proposal-version:${versionNumber}:submitted`,
          eventType: LIFECYCLE_EVENT.PROPOSAL_REVISION_SUBMITTED,
          aggregateType: "ApplicationProposalVersion",
          aggregateId: versionId,
          actorLabel: application.applicantEmail,
          previousState: `VERSION_${currentVersion.versionNumber}`,
          newState: `VERSION_${versionNumber}`,
          metadata: { changeSummary: parsed.data.changeSummary },
        },
        reviewerUserIds.map((reviewerUserId, index) => ({
          eventKey: `proposal-review-assignment:${assignmentIds[index]}:notify`,
          recipientId: reviewerUserId,
          notificationEvent: "EXAMINER_REVIEW_ASSIGNED",
          title: "Revised proposal ready for review",
          message: `Application proposal version ${versionNumber} is ready for an independent review.`,
          actionUrl: "/dashboard",
        })),
      );
      return createdVersion;
    });

    return version;
  } catch (error) {
    await prisma.uploadSession.updateMany({
      where: { id: draft.id, status: UploadSessionStatus.FINALIZING },
      data: {
        status: UploadSessionStatus.OPEN,
        failureReason:
          error instanceof Error
            ? error.message.slice(0, 1_000)
            : "Proposal revision finalization failed.",
      },
    });
    if (error instanceof ProposalRevisionError) throw error;
    if (error instanceof UploadVerificationError) {
      throw new ProposalRevisionError(error.message, 409);
    }
    throw new ProposalRevisionError(
      error instanceof Error
        ? error.message
        : "Unable to submit proposal revision.",
      500,
    );
  }
}
