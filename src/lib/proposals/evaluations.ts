import { DocumentType, ProposalStatus, UserRole } from "@prisma/client";

import { notify } from "@/lib/notifications";
import { prisma } from "@/lib/prisma/client";
import {
  assertFileUploadConstraints,
  normalizeStoragePath,
  StorageAccessError,
} from "@/lib/storage";
import {
  proposalEvaluationSchema,
  type ProposalEvaluationInput,
} from "@/lib/proposals/evaluation-schemas";
import type { AuthenticatedUserContext } from "@/types/auth";

export { proposalEvaluationSchema };

export class ProposalEvaluationError extends Error {
  status: 400 | 403 | 404 | 409 | 413 | 500;

  constructor(
    message: string,
    status: 400 | 403 | 404 | 409 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "ProposalEvaluationError";
    this.status = status;
  }
}

type EvaluationRecord = {
  id: string;
  feedback: string;
  adminComments: string | null;
  releasedAt: Date | null;
  submissionDate: Date;
  examiner: {
    id: string;
    user: {
      id: string;
      displayName: string;
      email: string;
    };
  };
  documents: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    createdAt: Date;
  }>;
};

type ProposalEvaluationView = {
  id: string;
  title: string;
  status: ProposalStatus;
  studentId: string;
  student: {
    id: string;
    user: {
      id: string;
      displayName: string;
      email: string;
    };
    supervisorAssignments: Array<{
      supervisorUserId: string;
    }>;
  };
  evaluations: EvaluationRecord[];
  versions: Array<{
    id: string;
    manifestHash: string;
  }>;
};

type ExaminerContext = {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
};

function mapEvaluationRecord(record: EvaluationRecord) {
  return {
    id: record.id,
    feedback: record.feedback,
    adminComments: record.adminComments,
    releasedAt: record.releasedAt,
    submissionDate: record.submissionDate,
    evaluator: {
      examinerId: record.examiner.id,
      userId: record.examiner.user.id,
      displayName: record.examiner.user.displayName,
      email: record.examiner.user.email,
    },
    documents: record.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      createdAt: document.createdAt,
    })),
  };
}

export function aggregateScores(evaluations: Array<unknown>) {
  return {
    evaluationCount: evaluations.length,
    reviewCount: evaluations.length,
    averageScore: null as number | null,
  };
}

async function findProposalForEvaluation(
  proposalId: string,
): Promise<ProposalEvaluationView | null> {
  return prisma.researchProposal.findUnique({
    where: {
      id: proposalId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      studentId: true,
      student: {
        select: {
          id: true,
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
      evaluations: {
        orderBy: {
          submissionDate: "asc",
        },
        select: {
          id: true,
          feedback: true,
          adminComments: true,
          releasedAt: true,
          submissionDate: true,
          examiner: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
          documents: {
            where: {
              isDeleted: false,
            },
            orderBy: {
              createdAt: "desc",
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
      },
      versions: {
        where: { isCurrent: true },
        take: 2,
        select: {
          id: true,
          manifestHash: true,
        },
      },
    },
  });
}

async function requireExaminerContext(
  auth: AuthenticatedUserContext,
): Promise<ExaminerContext> {
  if (auth.role !== UserRole.EXAMINER) {
    throw new ProposalEvaluationError("Only examiners can submit proposal reviews.", 403);
  }

  const examiner = await prisma.examiner.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!examiner) {
    throw new ProposalEvaluationError("Examiner profile not found.", 404);
  }

  return examiner;
}

function assertExaminerNotAssignedSupervisor(
  proposal: ProposalEvaluationView,
  examiner: ExaminerContext,
) {
  const hasSupervisorConflict = proposal.student.supervisorAssignments.some(
    (assignment) => assignment.supervisorUserId === examiner.userId,
  );

  if (hasSupervisorConflict) {
    throw new ProposalEvaluationError(
      "Assigned supervisors cannot review the same student's proposal.",
      403,
    );
  }
}

function assertProposalUnderReview(proposal: ProposalEvaluationView) {
  const allowedStatuses: ProposalStatus[] = [
    ProposalStatus.SUBMITTED,
    ProposalStatus.UNDER_REVIEW,
  ];
  if (!allowedStatuses.includes(proposal.status)) {
    throw new ProposalEvaluationError(
      "Proposal reviews are only allowed while the proposal is SUBMITTED or UNDER_REVIEW.",
      409,
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
    throw new ProposalEvaluationError(
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
      throw new ProposalEvaluationError(error.message, error.status);
    }

    throw error;
  }
}

async function notifyAdministratorsOfProposalReview(input: {
  proposal: ProposalEvaluationView;
  examiner: ExaminerContext;
  feedback: string;
}) {
  const administrators = await prisma.user.findMany({
    where: {
      role: UserRole.ADMINISTRATOR,
      isActive: true,
    },
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  });

  await Promise.all(
    administrators
      .filter((administrator) => administrator.email)
      .map((administrator) =>
        notify({
          event: "EXAMINER_REVIEW_SUBMITTED",
          recipientUserId: administrator.id,
          to: administrator.email,
          administratorName: administrator.displayName,
          examinerName: input.examiner.user.displayName,
          studentName: input.proposal.student.user.displayName,
          studentId: input.proposal.student.id,
          subjectTitle: input.proposal.title,
          reviewKind: "proposal",
          feedback: input.feedback,
        }),
      ),
  );
}

export async function createProposalEvaluation(
  proposalId: string,
  input: ProposalEvaluationInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = proposalEvaluationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProposalEvaluationError(
      parsed.error.issues[0]?.message ?? "Invalid proposal review.",
      400,
    );
  }

  const [proposal, examiner] = await Promise.all([
    findProposalForEvaluation(proposalId),
    requireExaminerContext(auth),
  ]);

  if (!proposal) {
    throw new ProposalEvaluationError("Research proposal not found.", 404);
  }

  assertExaminerNotAssignedSupervisor(proposal, examiner);
  assertProposalUnderReview(proposal);

  if (proposal.versions.length !== 1) {
    throw new ProposalEvaluationError(
      "Exactly one current logical proposal version is required for review.",
      409,
    );
  }
  const proposalVersion = proposal.versions[0];

  const existingEvaluation = proposal.evaluations.find(
    (evaluation) => evaluation.examiner.id === examiner.id,
  );

  if (existingEvaluation) {
    throw new ProposalEvaluationError(
      "You have already submitted a review for this proposal.",
      409,
    );
  }

  for (const document of parsed.data.documents) {
    assertReviewAttachment({
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    });
  }

  const evaluation = await prisma.evaluationForm.create({
    data: {
      researchProposalId: proposal.id,
      proposalVersionId: proposalVersion.id,
      examinerId: examiner.id,
      feedback: parsed.data.feedback,
      evidenceManifestHash: proposalVersion.manifestHash,
      submissionDate: new Date(),
      documents: {
        create: parsed.data.documents.map((document) => ({
          documentType: DocumentType.REVIEW_ATTACHMENT,
          studentId: proposal.studentId,
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
      feedback: true,
      adminComments: true,
      releasedAt: true,
      submissionDate: true,
      examiner: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      },
      documents: {
        where: {
          isDeleted: false,
        },
        orderBy: {
          createdAt: "desc",
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

  const aggregate = aggregateScores([...proposal.evaluations, evaluation]);

  await notifyAdministratorsOfProposalReview({
    proposal,
    examiner,
    feedback: parsed.data.feedback,
  });

  return {
    evaluation: mapEvaluationRecord(evaluation),
    aggregate,
  };
}

export async function getProposalEvaluations(
  proposalId: string,
  auth: AuthenticatedUserContext,
) {
  const proposal = await findProposalForEvaluation(proposalId);

  if (!proposal) {
    throw new ProposalEvaluationError("Research proposal not found.", 404);
  }

  if (auth.role === UserRole.EXAMINER) {
    const examiner = await requireExaminerContext(auth);
    assertExaminerNotAssignedSupervisor(proposal, examiner);
  } else if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new ProposalEvaluationError("Forbidden.", 403);
  }

  return {
    proposal: {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      student: {
        id: proposal.student.id,
        displayName: proposal.student.user.displayName,
        email: proposal.student.user.email,
      },
    },
    evaluations: proposal.evaluations.map(mapEvaluationRecord),
    aggregate: aggregateScores(proposal.evaluations),
  };
}
