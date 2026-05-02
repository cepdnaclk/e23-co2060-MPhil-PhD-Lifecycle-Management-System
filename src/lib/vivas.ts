import { ThesisStatus, VivaOutcome } from "@prisma/client";

import { notifyVivaScheduled } from "@/lib/email";
import { prisma } from "@/lib/prisma/client";
import { getCurrentThesisDownloadUrl, ThesisVersionError } from "@/lib/theses/versions";
import {
  scheduleVivaSchema,
  vivaOutcomeSubmissionSchema,
} from "@/lib/vivas/schemas";
import type { AuthenticatedUserContext } from "@/types/auth";
export { scheduleVivaSchema, vivaOutcomeSubmissionSchema };

export class VivaWorkflowError extends Error {
  status: 400 | 403 | 404 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
    this.name = "VivaWorkflowError";
    this.status = status;
  }
}

type VivaExaminerRecord = {
  id: string;
  thesisId: string;
  outcome: VivaOutcome | null;
  thesis: {
    id: string;
    title: string;
    abstract: string;
    status: ThesisStatus;
    student: {
      id: string;
      user: {
        displayName: string;
        email: string;
      };
    };
    examinerAssignments: Array<{
      examinerId: string;
      examinerUserId: string;
    }>;
  };
};

type ExaminerContext = {
  id: string;
  userId: string;
};

async function requireExaminerContext(
  auth: AuthenticatedUserContext,
): Promise<ExaminerContext> {
  const examiner = await prisma.examiner.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!examiner) {
    throw new VivaWorkflowError("Examiner profile not found.", 404);
  }

  return examiner;
}

async function requireVivaRecord(vivaId: string): Promise<VivaExaminerRecord> {
  const viva = await prisma.viva.findUnique({
    where: {
      id: vivaId,
    },
    select: {
      id: true,
      thesisId: true,
      outcome: true,
      thesis: {
        select: {
          id: true,
          title: true,
          abstract: true,
          status: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                  email: true,
                },
              },
            },
          },
          examinerAssignments: {
            select: {
              examinerId: true,
              examinerUserId: true,
            },
          },
        },
      },
    },
  });

  if (!viva) {
    throw new VivaWorkflowError("Viva record not found.", 404);
  }

  return viva;
}

function assertExaminerAssigned(
  viva: VivaExaminerRecord,
  examiner: ExaminerContext,
) {
  const isAssigned = viva.thesis.examinerAssignments.some(
    (assignment) =>
      assignment.examinerId === examiner.id ||
      assignment.examinerUserId === examiner.userId,
  );

  if (!isAssigned) {
    throw new VivaWorkflowError("Viva access denied.", 403);
  }
}

function assertOutcomeWindowOpen(viva: VivaExaminerRecord) {
  if (viva.thesis.status !== ThesisStatus.UNDER_EXAMINATION) {
    throw new VivaWorkflowError(
      "Viva outcomes can only be recorded while the thesis is UNDER_EXAMINATION.",
      409,
    );
  }
}

export function mapVivaOutcomeToThesisStatus(outcome: VivaOutcome): ThesisStatus {
  switch (outcome) {
    case VivaOutcome.PASS:
      return ThesisStatus.FINAL_ARCHIVE;
    case VivaOutcome.MINOR_CORRECTIONS:
    case VivaOutcome.MAJOR_CORRECTIONS:
      return ThesisStatus.CORRECTIONS_REQUIRED;
    case VivaOutcome.FAIL:
      return ThesisStatus.CLOSED;
  }
}

export async function getExaminerVivaWorkspace(
  vivaId: string,
  auth: AuthenticatedUserContext,
) {
  const examiner = await requireExaminerContext(auth);
  const viva = await requireVivaRecord(vivaId);

  assertExaminerAssigned(viva, examiner);

  try {
    const download = await getCurrentThesisDownloadUrl(viva.thesisId, auth);

    return {
      viva: {
        id: viva.id,
        outcome: viva.outcome,
      },
      thesis: {
        id: viva.thesis.id,
        title: viva.thesis.title,
        abstract: viva.thesis.abstract,
        status: viva.thesis.status,
        student: {
          id: viva.thesis.student.id,
          displayName: viva.thesis.student.user.displayName,
          email: viva.thesis.student.user.email,
        },
      },
      download,
      canRecordOutcome: viva.thesis.status === ThesisStatus.UNDER_EXAMINATION,
      outcomeFormReadOnly: viva.thesis.status !== ThesisStatus.UNDER_EXAMINATION,
    };
  } catch (error) {
    if (error instanceof ThesisVersionError) {
      throw new VivaWorkflowError(error.message, error.status);
    }

    throw error;
  }
}

export async function recordVivaOutcome(
  vivaId: string,
  input: { outcome: VivaOutcome },
  auth: AuthenticatedUserContext,
) {
  const parsed = vivaOutcomeSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new VivaWorkflowError(
      parsed.error.issues[0]?.message ?? "Invalid viva outcome payload.",
      400,
    );
  }

  const examiner = await requireExaminerContext(auth);
  const viva = await requireVivaRecord(vivaId);

  assertExaminerAssigned(viva, examiner);
  assertOutcomeWindowOpen(viva);

  const nextThesisStatus = mapVivaOutcomeToThesisStatus(parsed.data.outcome);

  const result = await prisma.$transaction(async (tx) => {
    const updatedViva = await tx.viva.update({
      where: {
        id: viva.id,
      },
      data: {
        outcome: parsed.data.outcome,
      },
      select: {
        id: true,
        thesisId: true,
        outcome: true,
        updatedAt: true,
      },
    });

    const updatedThesis = await tx.thesis.update({
      where: {
        id: viva.thesis.id,
      },
      data: {
        status: nextThesisStatus,
      },
      select: {
        id: true,
        status: true,
        title: true,
      },
    });

    return {
      viva: updatedViva,
      thesis: updatedThesis,
    };
  });

  return {
    ...result,
    nextThesisStatus,
    requiresAdministrativeApproval: parsed.data.outcome === VivaOutcome.PASS,
  };
}

export async function scheduleViva(
  input: {
    thesisId: string;
    venue: string;
    scheduledDate: string | Date;
  },
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== "ADMINISTRATOR") {
    throw new VivaWorkflowError("Only administrators can schedule vivas.", 403);
  }

  const parsed = scheduleVivaSchema.safeParse(input);

  if (!parsed.success) {
    throw new VivaWorkflowError(
      parsed.error.issues[0]?.message ?? "Invalid schedule viva payload.",
      400,
    );
  }

  const { thesisId, venue, scheduledDate } = parsed.data;

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        include: { user: true },
      },
      examinerAssignments: {
        include: {
          examiner: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!thesis) {
    throw new VivaWorkflowError("Thesis not found.", 404);
  }

  if (thesis.status !== ThesisStatus.UNDER_EXAMINATION) {
    throw new VivaWorkflowError(
      "A viva can only be scheduled if the thesis is UNDER_EXAMINATION.",
      400,
    );
  }

  const viva = await prisma.viva.upsert({
    where: { thesisId },
    create: {
      thesisId,
      venue,
      scheduledDate,
    },
    update: {
      venue,
      scheduledDate,
    },
  });

  // Notify Student
  await notifyVivaScheduled({
    recipientUserId: thesis.student.userId,
    to: thesis.student.user.email,
    recipientName: thesis.student.user.displayName,
    thesisTitle: thesis.title,
    venue,
    scheduledDate,
  });

  // Notify Examiners
  for (const assignment of thesis.examinerAssignments) {
    await notifyVivaScheduled({
      recipientUserId: assignment.examiner.userId,
      to: assignment.examiner.user.email,
      recipientName: assignment.examiner.user.displayName,
      thesisTitle: thesis.title,
      venue,
      scheduledDate,
    });
  }

  return viva;
}

export async function getAdminVivaDetails(
  vivaId: string,
  auth: AuthenticatedUserContext,
) {
  if (auth.role !== "ADMINISTRATOR") {
    throw new VivaWorkflowError("Admin access required.", 403);
  }

  const viva = await prisma.viva.findUnique({
    where: { id: vivaId },
    include: {
      thesis: {
        include: {
          student: {
            include: { user: true },
          },
          examinerAssignments: {
            include: {
              examiner: {
                include: { user: true },
              },
            },
          },
        },
      },
    },
  });

  if (!viva) {
    throw new VivaWorkflowError("Viva record not found.", 404);
  }

  return {
    viva: {
      id: viva.id,
      scheduledDate: viva.scheduledDate,
      venue: viva.venue,
      outcome: viva.outcome,
    },
    thesis: {
      id: viva.thesis.id,
      title: viva.thesis.title,
      status: viva.thesis.status,
    },
    student: {
      id: viva.thesis.student.id,
      displayName: viva.thesis.student.user.displayName,
      email: viva.thesis.student.user.email,
    },
    examiners: viva.thesis.examinerAssignments.map((a) => ({
      id: a.examiner.id,
      displayName: a.examiner.user.displayName,
      email: a.examiner.user.email,
    })),
  };
}
