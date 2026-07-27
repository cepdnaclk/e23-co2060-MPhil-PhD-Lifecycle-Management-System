import {
  AcademicStatus,
  CompletionStatus,
  CorrectionOrderStatus,
  DocumentVerificationStatus,
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowStage,
  ExaminerRecommendation,
  MilestoneStatus,
  ThesisStatus,
} from "@prisma/client";

import { HodCompletionDecisionPanel } from "@/components/hod/department-decision-panels";
import { getServerDashboardContext } from "@/lib/dashboard/server";
import { prisma } from "@/lib/prisma/client";
import { getProgrammeRule } from "@/lib/programmes/rules";

export default async function HodCompletionsPage() {
  await getServerDashboardContext("hod");
  const [corrections, students] = await Promise.all([
    prisma.correctionOrder.findMany({
      where: {
        status: {
          in: [
            CorrectionOrderStatus.SUPERVISOR_CERTIFIED,
            CorrectionOrderStatus.EXAMINER_APPROVED,
          ],
        },
      },
      select: {
        id: true,
        requirementType: true,
        requiresExaminerReview: true,
        status: true,
        requirements: true,
        thesis: { select: { student: { select: { user: { select: { displayName: true } } } } } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.student.findMany({
      where: {
        isArchived: false,
        academicStatus: {
          in: [AcademicStatus.ACTIVE, AcademicStatus.UNDER_REVIEW],
        },
        OR: [
          { programmeCompletion: null },
          {
            programmeCompletion: {
              is: { status: CompletionStatus.PENDING },
            },
          },
        ],
        theses: {
          some: {
            viva: { is: { hodOutcome: { not: null } } },
          },
        },
      },
      select: {
        id: true,
        programType: true,
        studyMode: true,
        user: { select: { displayName: true } },
        milestones: {
          orderBy: { sequenceNumber: "asc" },
          select: { status: true },
        },
        ethicsApprovals: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            applicability: true,
            status: true,
            workflowStage: true,
            validUntil: true,
          },
        },
        theses: {
          where: { isArchived: false },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            title: true,
            status: true,
            versions: {
              where: { isCurrent: true },
              select: {
                versionNumber: true,
                manifestHash: true,
                documents: {
                  where: { isDeleted: false },
                  select: {
                    verificationStatus: true,
                    checksumSha256: true,
                  },
                },
              },
            },
            viva: {
              select: {
                hodOutcome: true,
                correctionOrders: {
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 pt-6 md:p-8">
      <div><h2 className="text-3xl font-bold tracking-tight">Completion decisions</h2><p className="mt-2 text-muted-foreground">Close submitted corrections and approve academic completion.</p></div>
      <HodCompletionDecisionPanel
        corrections={corrections.map((order) => ({
          id: order.id,
          studentName: order.thesis.student.user.displayName,
          requirementType: order.requirementType,
          requiresExaminerReview: order.requiresExaminerReview,
          status: order.status,
          requirements: order.requirements,
          submissionCount: order._count.submissions,
        }))}
        students={students.map((student) => {
          const rule = getProgrammeRule(student.programType, student.studyMode);
          const ethics = student.ethicsApprovals[0];
          const thesis = student.theses[0];
          const version = thesis?.versions[0];
          const milestonesComplete =
            student.milestones.length === rule.milestoneCount &&
            student.milestones.every(
              (milestone) => milestone.status === MilestoneStatus.APPROVED,
            );
          const ethicsComplete =
            ethics?.workflowStage === EthicsWorkflowStage.COMPLETED &&
            ((ethics.applicability === EthicsApplicability.REQUIRED &&
              ethics.status === EthicsRecordStatus.APPROVED &&
              (!ethics.validUntil || ethics.validUntil >= new Date())) ||
              (ethics.applicability === EthicsApplicability.NOT_REQUIRED &&
                ethics.status === EthicsRecordStatus.EXEMPT));
          const versionVerified =
            Boolean(version?.manifestHash) &&
            (version?.documents.length ?? 0) > 0 &&
            version?.documents.every(
              (document) =>
                document.verificationStatus ===
                  DocumentVerificationStatus.VERIFIED &&
                Boolean(document.checksumSha256),
            );
          const directPass =
            thesis?.viva?.hodOutcome === ExaminerRecommendation.PASS &&
            thesis.status === ThesisStatus.UNDER_EXAMINATION;
          const correctionsComplete =
            (thesis?.viva?.hodOutcome ===
              ExaminerRecommendation.MINOR_CORRECTIONS ||
              thesis?.viva?.hodOutcome ===
                ExaminerRecommendation.MAJOR_CORRECTIONS) &&
            thesis.status === ThesisStatus.CORRECTIONS_APPROVED &&
            (thesis.viva.correctionOrders.length ?? 0) > 0 &&
            thesis.viva.correctionOrders.every(
              (order) =>
                order.status === CorrectionOrderStatus.COMPLETION_APPROVED,
            );

          return {
            id: student.id,
            studentName: student.user.displayName,
            thesisTitle: thesis?.title ?? "Thesis",
            programmeLabel: `${student.programType} ${student.studyMode.replaceAll("_", " ")}`,
            milestoneSummary: `${student.milestones.filter((milestone) => milestone.status === MilestoneStatus.APPROVED).length}/${rule.milestoneCount} milestones`,
            ethicsSummary: ethicsComplete
              ? "Ethics gate complete"
              : "Ethics gate incomplete",
            thesisVersionSummary: version
              ? `Thesis v${version.versionNumber} ${versionVerified ? "verified" : "unverified"}`
              : "No current thesis version",
            outcomeSummary:
              thesis?.viva?.hodOutcome?.replaceAll("_", " ") ??
              "No HOD outcome",
            ready:
              milestonesComplete &&
              ethicsComplete &&
              versionVerified &&
              (directPass || correctionsComplete),
          };
        })}
      />
    </div>
  );
}
