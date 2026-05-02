import { ProposalStatus, UserRole } from "@prisma/client";

import { notifyProposalEvaluationSubmittedToAdministrator } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import {
  proposalEvaluationSchema,
  type ProposalEvaluationInput,
} from "@/lib/proposals/evaluation-schemas";
import type { AuthenticatedUserContext } from "@/types/auth";
export { proposalEvaluationSchema };

export class ProposalEvaluationError extends Error {
  status: 400 | 403 | 404 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
    this.name = "ProposalEvaluationError";
    this.status = status;
  }
}

type EvaluationRecord = {
  id: string;
  numericalScore: number;
  feedback: string;
  submissionDate: Date;
  supervisor: {
    id: string;
    user: {
      id: string;
      displayName: string;
      email: string;
    };
  };
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
      supervisorId: string;
      supervisorUserId: string;
    }>;
  };
  evaluations: EvaluationRecord[];
};

type SupervisorContext = {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
};

type AdministratorRecipient = {
  id: string;
  displayName: string;
  email: string;
};

function mapEvaluationRecord(record: EvaluationRecord) {
  return {
    id: record.id,
    numericalScore: record.numericalScore,
    feedback: record.feedback,
    submissionDate: record.submissionDate,
    evaluator: {
      supervisorId: record.supervisor.id,
      userId: record.supervisor.user.id,
      displayName: record.supervisor.user.displayName,
      email: record.supervisor.user.email,
    },
  };
}

export function aggregateScores(evaluations: Array<Pick<EvaluationRecord, "numericalScore">>) {
  const evaluationCount = evaluations.length;

  if (evaluationCount === 0) {
    return {
      evaluationCount: 0,
      averageScore: null as number | null,
    };
  }

  const totalScore = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.numericalScore,
    0,
  );

  return {
    evaluationCount,
    averageScore: Number((totalScore / evaluationCount).toFixed(2)),
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
              supervisorId: true,
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
          numericalScore: true,
          feedback: true,
          submissionDate: true,
          supervisor: {
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
        },
      },
    },
  });
}

async function requireSupervisorContext(
  auth: AuthenticatedUserContext,
): Promise<SupervisorContext> {
  const supervisor = await prisma.supervisor.findUnique({
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

  if (!supervisor) {
    throw new ProposalEvaluationError("Supervisor profile not found.", 404);
  }

  return supervisor;
}

function assertSupervisorAssignedToProposal(
  proposal: ProposalEvaluationView,
  supervisor: SupervisorContext,
) {
  const isAssigned = proposal.student.supervisorAssignments.some(
    (assignment) =>
      assignment.supervisorId === supervisor.id ||
      assignment.supervisorUserId === supervisor.userId,
  );

  if (!isAssigned) {
    throw new ProposalEvaluationError(
      "You can only evaluate proposals for students assigned to you.",
      403,
    );
  }
}

function assertProposalUnderReview(proposal: ProposalEvaluationView) {
  if (
    proposal.status !== ProposalStatus.SUBMITTED &&
    proposal.status !== ProposalStatus.UNDER_REVIEW
  ) {
    throw new ProposalEvaluationError(
      "Proposal evaluations are only allowed while the proposal is SUBMITTED or UNDER_REVIEW.",
      409,
    );
  }
}

async function findActiveAdministrators(): Promise<AdministratorRecipient[]> {
  return prisma.user.findMany({
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
}

export async function createProposalEvaluation(
  proposalId: string,
  input: ProposalEvaluationInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = proposalEvaluationSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProposalEvaluationError(
      parsed.error.issues[0]?.message ?? "Invalid proposal evaluation.",
      400,
    );
  }

  const [proposal, supervisor] = await Promise.all([
    findProposalForEvaluation(proposalId),
    requireSupervisorContext(auth),
  ]);

  if (!proposal) {
    throw new ProposalEvaluationError("Research proposal not found.", 404);
  }

  assertSupervisorAssignedToProposal(proposal, supervisor);
  assertProposalUnderReview(proposal);

  const existingEvaluation = proposal.evaluations.find(
    (evaluation) => evaluation.supervisor.id === supervisor.id,
  );

  if (existingEvaluation) {
    throw new ProposalEvaluationError(
      "You have already submitted an evaluation for this proposal.",
      409,
    );
  }

  const evaluation = await prisma.evaluationForm.create({
    data: {
      researchProposalId: proposal.id,
      supervisorId: supervisor.id,
      numericalScore: parsed.data.numericalScore,
      feedback: parsed.data.feedback,
      submissionDate: new Date(),
    },
    select: {
      id: true,
      numericalScore: true,
      feedback: true,
      submissionDate: true,
      supervisor: {
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
    },
  });

  const administrators = await findActiveAdministrators();

  await Promise.all(
    administrators.map((administrator) =>
      notifyProposalEvaluationSubmittedToAdministrator({
        recipientUserId: administrator.id,
        to: administrator.email,
        administratorName: administrator.displayName,
        supervisorName: supervisor.user.displayName,
        studentName: proposal.student.user.displayName,
        proposalTitle: proposal.title,
        numericalScore: evaluation.numericalScore,
      }),
    ),
  );

  const aggregate = aggregateScores([...proposal.evaluations, evaluation]);

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

  if (auth.role === UserRole.SUPERVISOR) {
    const supervisor = await requireSupervisorContext(auth);
    assertSupervisorAssignedToProposal(proposal, supervisor);
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
