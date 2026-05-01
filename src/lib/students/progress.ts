import {
  DocumentType,
  ProgramType,
  ProposalStatus,
  ThesisStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export type ProgressMilestoneId =
  | "proposal-submission"
  | "proposal-approval"
  | "ethics-clearance"
  | "data-collection"
  | "thesis-submission"
  | "examiner-feedback";

export type ProgressStepperStep = {
  id: ProgressMilestoneId;
  label: string;
  description: string;
  state: "complete" | "current" | "upcoming";
  visible: boolean;
};

export type StageProgressSummary = {
  totalSubmittedVersions: number;
  approvedVersions: number;
  completionPercentage: number;
};

type StudentProgressRecord = {
  id: string;
  userId: string;
  programType: ProgramType;
  enrollmentDate: Date;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  researchProposals: Array<{
    id: string;
    title: string;
    status: ProposalStatus;
    updatedAt: Date;
  }>;
  theses: Array<{
    id: string;
    title: string;
    status: ThesisStatus;
    updatedAt: Date;
    corrections: Array<{
      id: string;
      isApproved: boolean;
      approvedAt: Date | null;
      approvedById: string | null;
    }>;
  }>;
};

type StudentDocumentRecord = {
  id: string;
  documentType: DocumentType;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
  updatedAt: Date;
  researchProposal: {
    status: ProposalStatus;
  } | null;
  progressReport: {
    isSupervisorSignedOff: boolean;
  } | null;
  thesis: {
    status: ThesisStatus;
  } | null;
  correctionDocument: {
    isApproved: boolean;
    approvedAt: Date | null;
    approvedById: string | null;
  } | null;
};

type ApprovedDocumentSnapshot = {
  milestoneId: ProgressMilestoneId;
  approvedAt: Date;
};

export class StudentProgressError extends Error {
  status: 400 | 403 | 404 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 500 = 400) {
    super(message);
    this.name = "StudentProgressError";
    this.status = status;
  }
}

async function findStudentProgressRecord(
  studentId: string,
): Promise<StudentProgressRecord | null> {
  return prisma.student.findUnique({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      userId: true,
      programType: true,
      enrollmentDate: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      researchProposals: {
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      },
      theses: {
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          corrections: {
            select: {
              id: true,
              isApproved: true,
              approvedAt: true,
              approvedById: true,
            },
          },
        },
      },
    },
  });
}

async function findStudentDocuments(
  studentId: string,
): Promise<StudentDocumentRecord[]> {
  return prisma.document.findMany({
    where: {
      studentId,
      isDeleted: false,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      documentType: true,
      version: true,
      isCurrentVersion: true,
      createdAt: true,
      updatedAt: true,
      researchProposal: {
        select: {
          status: true,
        },
      },
      progressReport: {
        select: {
          isSupervisorSignedOff: true,
        },
      },
      thesis: {
        select: {
          status: true,
        },
      },
      correctionDocument: {
        select: {
          isApproved: true,
          approvedAt: true,
          approvedById: true,
        },
      },
    },
  });
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function getProgramDurationMonths(programType: ProgramType) {
  return programType === ProgramType.PHD ? 48 : 24;
}

export function getEstimatedCompletionDate(
  enrollmentDate: Date,
  programType: ProgramType,
) {
  return addMonths(enrollmentDate, getProgramDurationMonths(programType));
}

function isProposalDocumentApproved(document: StudentDocumentRecord) {
  return (
    document.documentType === DocumentType.PROPOSAL &&
    document.isCurrentVersion &&
    document.researchProposal?.status === ProposalStatus.APPROVED
  );
}

function isProgressDocumentApproved(document: StudentDocumentRecord) {
  return (
    document.documentType === DocumentType.PROGRESS_REPORT &&
    document.progressReport?.isSupervisorSignedOff === true
  );
}

function isThesisDocumentApproved(document: StudentDocumentRecord) {
  return (
    document.documentType === DocumentType.THESIS &&
    document.isCurrentVersion &&
    (document.thesis?.status === ThesisStatus.FINAL_ARCHIVE ||
      document.thesis?.status === ThesisStatus.CLOSED)
  );
}

function isCorrectionDocumentReleased(document: StudentDocumentRecord) {
  return (
    document.documentType === DocumentType.CORRECTION &&
    document.correctionDocument?.isApproved === true &&
    document.correctionDocument.approvedById !== null
  );
}

export function getDocumentStageCounts(documents: StudentDocumentRecord[]) {
  const proposalDocuments = documents.filter(
    (document) => document.documentType === DocumentType.PROPOSAL,
  );
  const approvedProposalDocuments = proposalDocuments.filter(
    isProposalDocumentApproved,
  );

  const progressDocuments = documents.filter(
    (document) => document.documentType === DocumentType.PROGRESS_REPORT,
  );
  const approvedProgressDocuments = progressDocuments.filter(
    isProgressDocumentApproved,
  );

  const thesisDocuments = documents.filter(
    (document) => document.documentType === DocumentType.THESIS,
  );
  const approvedThesisDocuments = thesisDocuments.filter(isThesisDocumentApproved);

  const correctionDocuments = documents.filter(
    (document) => document.documentType === DocumentType.CORRECTION,
  );
  const releasedCorrectionDocuments = correctionDocuments.filter(
    isCorrectionDocumentReleased,
  );

  return {
    proposal: {
      totalSubmittedVersions: proposalDocuments.length,
      approvedVersions: approvedProposalDocuments.length,
    },
    ethics: {
      totalSubmittedVersions: Math.min(progressDocuments.length, 1),
      approvedVersions: Math.min(approvedProgressDocuments.length, 1),
    },
    dataCollection: {
      totalSubmittedVersions: Math.max(progressDocuments.length - 1, 0),
      approvedVersions: Math.max(approvedProgressDocuments.length - 1, 0),
    },
    thesis: {
      totalSubmittedVersions: thesisDocuments.length + correctionDocuments.length,
      approvedVersions:
        approvedThesisDocuments.length + releasedCorrectionDocuments.length,
    },
    approvedProgressDocuments,
    releasedCorrectionDocuments,
  };
}

export function calculateStageCompletionPercentages(input: {
  proposalStatus: ProposalStatus | null;
  thesisStatus: ThesisStatus | null;
  documents: StudentDocumentRecord[];
}) {
  const counts = getDocumentStageCounts(input.documents);

  const proposalCompletion =
    input.proposalStatus === ProposalStatus.APPROVED
      ? 100
      : counts.proposal.totalSubmittedVersions > 0
        ? 60
        : 0;

  const ethicsCompletion =
    counts.ethics.approvedVersions > 0
      ? 100
      : counts.ethics.totalSubmittedVersions > 0
        ? 50
        : 0;

  const dataCollectionCompletion =
    input.thesisStatus !== null
      ? 100
      : counts.dataCollection.approvedVersions > 0
        ? 100
        : counts.dataCollection.totalSubmittedVersions > 0
          ? 50
          : 0;

  let thesisCompletion = 0;

  if (
    input.thesisStatus === ThesisStatus.FINAL_ARCHIVE ||
    input.thesisStatus === ThesisStatus.CLOSED
  ) {
    thesisCompletion = 100;
  } else if (input.thesisStatus === ThesisStatus.CORRECTIONS_REQUIRED) {
    thesisCompletion = 75;
  } else if (input.thesisStatus === ThesisStatus.UNDER_EXAMINATION) {
    thesisCompletion = 60;
  } else if (input.thesisStatus === ThesisStatus.SUBMITTED) {
    thesisCompletion = 40;
  }

  return {
    proposal: {
      ...counts.proposal,
      completionPercentage: proposalCompletion,
    },
    ethics: {
      totalSubmittedVersions: counts.ethics.totalSubmittedVersions,
      approvedVersions: counts.ethics.approvedVersions,
      completionPercentage: proposalCompletion < 100 ? 0 : ethicsCompletion,
    },
    dataCollection: {
      totalSubmittedVersions: counts.dataCollection.totalSubmittedVersions,
      approvedVersions: counts.dataCollection.approvedVersions,
      completionPercentage:
        proposalCompletion < 100 ? 0 : dataCollectionCompletion,
    },
    thesis: {
      totalSubmittedVersions: counts.thesis.totalSubmittedVersions,
      approvedVersions: counts.thesis.approvedVersions,
      completionPercentage: proposalCompletion < 100 ? 0 : thesisCompletion,
    },
  } satisfies Record<
    "proposal" | "ethics" | "dataCollection" | "thesis",
    StageProgressSummary
  >;
}

function toApprovedDocumentSnapshot(
  document: StudentDocumentRecord,
  approvedProgressIndex: number,
): ApprovedDocumentSnapshot | null {
  if (isProposalDocumentApproved(document)) {
    return {
      milestoneId: "proposal-approval",
      approvedAt: document.updatedAt,
    };
  }

  if (isProgressDocumentApproved(document)) {
    return {
      milestoneId:
        approvedProgressIndex <= 1 ? "ethics-clearance" : "data-collection",
      approvedAt: document.updatedAt,
    };
  }

  if (isThesisDocumentApproved(document)) {
    return {
      milestoneId: "thesis-submission",
      approvedAt: document.updatedAt,
    };
  }

  if (isCorrectionDocumentReleased(document)) {
    return {
      milestoneId: "examiner-feedback",
      approvedAt:
        document.correctionDocument?.approvedAt ?? document.updatedAt,
    };
  }

  return null;
}

export function determineCurrentMilestone(input: {
  proposalStatus: ProposalStatus | null;
  thesisStatus?: ThesisStatus | null;
  documents: StudentDocumentRecord[];
}) {
  if (
    input.thesisStatus === ThesisStatus.FINAL_ARCHIVE ||
    input.thesisStatus === ThesisStatus.CLOSED
  ) {
    return "examiner-feedback" as ProgressMilestoneId;
  }

  let approvedProgressIndex = 0;

  const approvedMilestones = input.documents
    .map((document) => {
      if (isProgressDocumentApproved(document)) {
        approvedProgressIndex += 1;
      }

      return toApprovedDocumentSnapshot(document, approvedProgressIndex);
    })
    .filter((record): record is ApprovedDocumentSnapshot => record !== null)
    .sort((left, right) => right.approvedAt.getTime() - left.approvedAt.getTime());

  if (approvedMilestones.length > 0) {
    return approvedMilestones[0].milestoneId;
  }

  if (input.proposalStatus === ProposalStatus.APPROVED) {
    return "proposal-approval" as ProgressMilestoneId;
  }

  if (
    input.documents.some((document) => document.documentType === DocumentType.PROPOSAL)
  ) {
    return "proposal-submission" as ProgressMilestoneId;
  }

  return "proposal-submission" as ProgressMilestoneId;
}

function buildMilestoneTemplate() {
  return [
    {
      id: "proposal-submission" as const,
      label: "Proposal Submission",
      description: "Initial proposal versions submitted for lifecycle review.",
    },
    {
      id: "proposal-approval" as const,
      label: "Proposal Approval",
      description: "Proposal officially approved and research plan unlocked.",
    },
    {
      id: "ethics-clearance" as const,
      label: "Ethics Clearance",
      description: "Early approved progress evidence indicates ethics readiness.",
    },
    {
      id: "data-collection" as const,
      label: "Data Collection",
      description: "Mid-cycle approved progress evidence indicates research execution.",
    },
    {
      id: "thesis-submission" as const,
      label: "Thesis Submission",
      description: "Thesis documents have moved into the formal submission lifecycle.",
    },
    {
      id: "examiner-feedback" as const,
      label: "Examiner Feedback",
      description: "Released examination feedback is now visible to the student.",
    },
  ];
}

export function buildProgressStepper(input: {
  currentMilestone: ProgressMilestoneId;
  proposalApproved: boolean;
  thesisStarted: boolean;
  examinerFeedbackReleased: boolean;
}) {
  const visibleMilestones = buildMilestoneTemplate().filter((milestone) => {
    if (milestone.id === "examiner-feedback") {
      return input.examinerFeedbackReleased;
    }

    if (
      (milestone.id === "ethics-clearance" ||
        milestone.id === "data-collection" ||
        milestone.id === "thesis-submission") &&
      !input.proposalApproved
    ) {
      return milestone.id === "thesis-submission" ? input.thesisStarted : true;
    }

    return true;
  });

  const currentIndex = visibleMilestones.findIndex(
    (milestone) => milestone.id === input.currentMilestone,
  );

  return visibleMilestones.map((milestone, index) => ({
    ...milestone,
    visible: true,
    state:
      input.examinerFeedbackReleased && milestone.id === "examiner-feedback"
        ? "complete"
        : input.examinerFeedbackReleased && currentIndex !== -1 && index < currentIndex
          ? "complete"
          : currentIndex === -1
            ? index === 0
              ? "current"
              : "upcoming"
            : index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming",
  })) satisfies ProgressStepperStep[];
}

function assertStudentProgressAccess(
  auth: AuthenticatedUserContext,
  student: Pick<StudentProgressRecord, "userId">,
) {
  if (auth.role !== UserRole.STUDENT) {
    throw new StudentProgressError("Forbidden.", 403);
  }

  if (student.userId !== auth.userId) {
    throw new StudentProgressError("Forbidden.", 403);
  }
}

export async function getStudentProgressById(
  studentId: string,
  auth: AuthenticatedUserContext,
) {
  const [student, documents] = await Promise.all([
    findStudentProgressRecord(studentId),
    findStudentDocuments(studentId),
  ]);

  if (!student) {
    throw new StudentProgressError("Student progress record not found.", 404);
  }

  assertStudentProgressAccess(auth, student);

  const latestProposal = student.researchProposals[0] ?? null;
  const latestThesis = student.theses[0] ?? null;
  const examinerFeedbackReleased = latestThesis
    ? latestThesis.status === ThesisStatus.FINAL_ARCHIVE ||
      latestThesis.status === ThesisStatus.CLOSED ||
      latestThesis.corrections.some(
        (correction) => correction.isApproved && correction.approvedById !== null,
      )
    : false;

  const stageProgress = calculateStageCompletionPercentages({
    proposalStatus: latestProposal?.status ?? null,
    thesisStatus: latestThesis?.status ?? null,
    documents,
  });
  const currentMilestone = determineCurrentMilestone({
    proposalStatus: latestProposal?.status ?? null,
    thesisStatus: latestThesis?.status ?? null,
    documents,
  });

  return {
    student: {
      id: student.id,
      userId: student.userId,
      displayName: student.user.displayName,
      email: student.user.email,
      programType: student.programType,
      enrollmentDate: student.enrollmentDate,
    },
    latestStatuses: {
      proposal: latestProposal?.status ?? null,
      thesis: latestThesis?.status ?? null,
    },
    currentMilestone,
    stageProgress,
    stepper: buildProgressStepper({
      currentMilestone,
      proposalApproved: (latestProposal?.status ?? null) === ProposalStatus.APPROVED,
      thesisStarted: latestThesis !== null,
      examinerFeedbackReleased,
    }),
    estimatedCompletionDate: getEstimatedCompletionDate(
      student.enrollmentDate,
      student.programType,
    ),
    counts: {
      totalDocumentVersions: documents.length,
      approvedDocumentVersions:
        stageProgress.proposal.approvedVersions +
        stageProgress.ethics.approvedVersions +
        stageProgress.dataCollection.approvedVersions +
        stageProgress.thesis.approvedVersions,
    },
    examinerFeedbackReleased,
  };
}
