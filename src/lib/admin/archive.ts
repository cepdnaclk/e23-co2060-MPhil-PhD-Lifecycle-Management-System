import { AcademicStatus, ThesisStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import type { AuthenticatedUserContext } from "@/types/auth";

export class ArchiveError extends Error {
  status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ArchiveError";
    this.status = status;
  }
}

async function requireAdministrator(auth: AuthenticatedUserContext) {
  if (auth.role !== UserRole.ADMINISTRATOR) {
    throw new ArchiveError("Forbidden.", 403);
  }

  const administrator = await prisma.administrator.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
    },
  });

  if (!administrator) {
    throw new ArchiveError("Administrator profile not found.", 404);
  }

  return administrator;
}

export async function archiveStudentRecord(
  studentId: string,
  auth: AuthenticatedUserContext,
) {
  await requireAdministrator(auth);

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
    },
    select: {
      id: true,
      academicStatus: true,
      application: {
        select: {
          id: true,
          isArchived: true,
        },
      },
      theses: {
        where: {
          status: {
            in: [
              ThesisStatus.SUBMITTED,
              ThesisStatus.UNDER_EXAMINATION,
              ThesisStatus.CORRECTIONS_REQUIRED,
            ],
          },
        },
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });

  if (!student) {
    throw new ArchiveError("Student not found.", 404);
  }

  const warnings = student.theses.map((thesis) => ({
    thesisId: thesis.id,
    title: thesis.title,
    status: thesis.status,
    message: "This student has an active thesis submission in the pipeline.",
  }));

  const result = await prisma.$transaction(async (tx) => {
    const archivedStudent = await tx.student.update({
      where: {
        id: student.id,
      },
      data: {
        isArchived: true,
        academicStatus: AcademicStatus.ARCHIVED,
        updatedBy: auth.userId,
      },
      select: {
        id: true,
        academicStatus: true,
        isArchived: true,
      },
    });

    await tx.application.updateMany({
      where: {
        studentId: student.id,
        isArchived: false,
      },
      data: {
        isArchived: true,
      },
    });

    await tx.progressReport.updateMany({
      where: {
        studentId: student.id,
        isArchived: false,
      },
      data: {
        isArchived: true,
      },
    });

    await tx.researchProposal.updateMany({
      where: {
        studentId: student.id,
        isArchived: false,
      },
      data: {
        isArchived: true,
      },
    });

    await tx.ethicsApproval.updateMany({
      where: {
        studentId: student.id,
        isArchived: false,
      },
      data: {
        isArchived: true,
      },
    });

    return archivedStudent;
  });

  return {
    student: result,
    warnings,
  };
}

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
      status: approval.status,
      studentId: approval.student.id,
      studentName: approval.student.user.displayName,
      updatedAt: approval.updatedAt,
    })),
  };
}
