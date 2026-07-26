import {
  AssignmentStatus,
  DocumentType,
  ReadinessDecision,
  ThesisStatus,
} from "@prisma/client";
import { z } from "zod";

import { appendLifecycleEvent, LIFECYCLE_EVENT } from "@/lib/audit/lifecycle";
import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export const examinerAssignmentSchema = z.object({
  thesisId: z.string().min(1, "Thesis id is required."),
  examinerId: z.string().min(1, "Examiner id is required."),
});

export type ExaminerAssignmentInput = z.infer<typeof examinerAssignmentSchema>;

export class ExaminerAssignmentError extends Error {
  status: 400 | 403 | 404 | 409 | 422 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 422 | 500 = 400) {
    super(message);
    this.name = "ExaminerAssignmentError";
    this.status = status;
  }
}

type AdministratorContext = {
  id: string;
  user: {
    displayName: string;
  };
};

type ExaminerContext = {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    isActive: boolean;
  };
};

type ThesisDocumentRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
};

type ThesisAssignmentView = {
  id: string;
  title: string;
  status: ThesisStatus;
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
      supervisorId: string;
    }>;
  };
  examinerAssignments: Array<{
    examinerId: string;
    examinerUserId: string;
  }>;
  documents: ThesisDocumentRecord[];
  versions: Array<{
    id: string;
    manifestHash: string;
    isCurrent: boolean;
  }>;
  readinessCertification: {
    decision: ReadinessDecision;
  } | null;
};

async function requireAdministratorContext(
  auth: AuthenticatedUserContext,
): Promise<AdministratorContext> {
  const administrator = await prisma.administrator.findUnique({
    where: {
      userId: auth.userId,
    },
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
    throw new ExaminerAssignmentError("Administrator profile not found.", 404);
  }

  return administrator;
}

async function requireExaminer(examinerId: string): Promise<ExaminerContext> {
  const examiner = await prisma.examiner.findUnique({
    where: {
      id: examinerId,
    },
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
    throw new ExaminerAssignmentError("Examiner not found.", 404);
  }

  if (!examiner.user.isActive) {
    throw new ExaminerAssignmentError("Examiner account is inactive.", 409);
  }

  return examiner;
}

async function requireThesis(thesisId: string): Promise<ThesisAssignmentView> {
  const thesis = await prisma.thesis.findUnique({
    where: {
      id: thesisId,
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
              supervisorId: true,
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
      documents: {
        where: {
          isDeleted: false,
          documentType: DocumentType.THESIS,
        },
        orderBy: {
          version: "asc",
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
      },
      versions: {
        where: { isCurrent: true },
        take: 2,
        select: {
          id: true,
          manifestHash: true,
          isCurrent: true,
        },
      },
      readinessCertification: {
        select: { decision: true },
      },
    },
  });

  if (!thesis) {
    throw new ExaminerAssignmentError("Thesis not found.", 404);
  }

  return thesis;
}

function assertValidThesisState(thesis: ThesisAssignmentView) {
  if (
    thesis.readinessCertification?.decision !== ReadinessDecision.CERTIFIED
  ) {
    throw new ExaminerAssignmentError(
      "Primary Supervisor thesis readiness certification is required before proposing an examiner.",
      422,
    );
  }
  if (
    thesis.status !== ThesisStatus.SUBMITTED &&
    thesis.status !== ThesisStatus.UNDER_EXAMINATION
  ) {
    throw new ExaminerAssignmentError(
      "Examiner assignments are only allowed while the thesis is SUBMITTED or UNDER_EXAMINATION.",
      422,
    );
  }
}

function assertNotAlreadyAssigned(
  thesis: ThesisAssignmentView,
  examiner: ExaminerContext,
) {
  const duplicateAssignment = thesis.examinerAssignments.some(
    (assignment) =>
      assignment.examinerId === examiner.id ||
      assignment.examinerUserId === examiner.userId,
  );

  if (duplicateAssignment) {
    throw new ExaminerAssignmentError(
      "This examiner is already assigned to the selected thesis.",
      409,
    );
  }
}

function assertNoSupervisorConflict(
  thesis: ThesisAssignmentView,
  examiner: ExaminerContext,
) {
  const isSupervisorForStudent = thesis.student.supervisorAssignments.some(
    (assignment) =>
      assignment.supervisorId === examiner.id ||
      assignment.supervisorUserId === examiner.userId,
  );

  if (isSupervisorForStudent) {
    throw new ExaminerAssignmentError(
      "The selected examiner cannot be assigned because they are already a supervisor for this student.",
      422,
    );
  }
}

function getCurrentThesisDocument(thesis: ThesisAssignmentView) {
  const currentDocuments = thesis.documents.filter(
    (document) => document.isCurrentVersion,
  );

  if (thesis.documents.length === 0 || currentDocuments.length === 0) {
    throw new ExaminerAssignmentError(
      "At least one current thesis document must exist before assigning an examiner.",
      409,
    );
  }

  return currentDocuments[0];
}

function getCurrentThesisVersion(thesis: ThesisAssignmentView) {
  if (thesis.versions.length !== 1) {
    throw new ExaminerAssignmentError(
      "Exactly one current logical thesis version is required before assigning an examiner.",
      409,
    );
  }

  return thesis.versions[0];
}

export async function assignExaminerToThesis(
  input: ExaminerAssignmentInput,
  auth: AuthenticatedUserContext,
) {
  const parsed = examinerAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new ExaminerAssignmentError(
      parsed.error.issues[0]?.message ?? "Invalid examiner assignment payload.",
      400,
    );
  }

  const [administrator, thesis, examiner] = await Promise.all([
    requireAdministratorContext(auth),
    requireThesis(parsed.data.thesisId),
    requireExaminer(parsed.data.examinerId),
  ]);

  assertValidThesisState(thesis);
  assertNotAlreadyAssigned(thesis, examiner);
  assertNoSupervisorConflict(thesis, examiner);

  getCurrentThesisDocument(thesis);
  const currentVersion = getCurrentThesisVersion(thesis);

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.thesisExaminerAssignment.create({
      data: {
        thesisId: thesis.id,
        thesisVersionId: currentVersion.id,
        studentId: thesis.studentId,
        examinerId: examiner.id,
        examinerUserId: examiner.userId,
        assignedAt: new Date(),
        assignedBy: administrator.id,
        status: AssignmentStatus.PENDING,
        evidenceManifestHash: currentVersion.manifestHash,
      },
      select: {
        id: true,
        thesisId: true,
        studentId: true,
        examinerId: true,
        examinerUserId: true,
        assignedAt: true,
        assignedBy: true,
        status: true,
      },
    });
    await appendLifecycleEvent(tx as never, {
      eventKey: `thesis-examiner-assignment:${created.id}:proposed`,
      eventType: LIFECYCLE_EVENT.THESIS_EXAMINER_ASSIGNED,
      aggregateType: "ThesisExaminerAssignment",
      aggregateId: created.id,
      actorUserId: auth.userId,
      actorRole: auth.role,
      newState: AssignmentStatus.PENDING,
      metadata: {
        thesisId: thesis.id,
        thesisVersionId: currentVersion.id,
        examinerId: examiner.id,
      },
    });
    return created;
  });

  return { assignment, awaitingHodConfirmation: true };
}
