import { prisma } from "@/lib/prisma/client";

export async function listArchivedRecords() {
  const [students, applications, theses, progressReports, proposals, ethicsApprovals] =
    await Promise.all([
      prisma.student.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          academicStatus: true,
          updatedAt: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      }),
      prisma.application.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          applicantName: true,
          applicantEmail: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.thesis.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      }),
      prisma.progressReport.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          periodLabel: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      }),
      prisma.researchProposal.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      }),
      prisma.ethicsApproval.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      }),
    ]);

  return {
    students: students.map((student) => ({
      id: student.id,
      studentName: student.user.displayName,
      email: student.user.email,
      academicStatus: student.academicStatus,
      updatedAt: student.updatedAt,
    })),
    applications,
    theses: theses.map((thesis) => ({
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      studentId: thesis.student.id,
      studentName: thesis.student.user.displayName,
      updatedAt: thesis.updatedAt,
    })),
    progressReports: progressReports.map((report) => ({
      id: report.id,
      periodLabel: report.periodLabel,
      studentId: report.student.id,
      studentName: report.student.user.displayName,
      updatedAt: report.updatedAt,
    })),
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      studentId: proposal.student.id,
      studentName: proposal.student.user.displayName,
      updatedAt: proposal.updatedAt,
    })),
    ethicsApprovals: ethicsApprovals.map((approval) => ({
      id: approval.id,
      title: approval.title,
      studentId: approval.student.id,
      studentName: approval.student.user.displayName,
      updatedAt: approval.updatedAt,
    })),
  };
}
