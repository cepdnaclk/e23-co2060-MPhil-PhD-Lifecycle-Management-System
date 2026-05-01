import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    try {
      const supervisor = await prisma.supervisor.findUnique({
        where: { userId: context.auth.userId },
        select: { id: true },
      });

      if (!supervisor) {
        return NextResponse.json({ error: "Supervisor profile not found." }, { status: 404 });
      }

      // Find all progress reports for students assigned to this supervisor
      const reports = await prisma.progressReport.findMany({
        where: {
          isSupervisorSignedOff: false,
          isArchived: false,
          student: {
            supervisorAssignments: {
              some: {
                supervisorId: supervisor.id,
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          student: {
            include: {
              user: {
                select: {
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      return NextResponse.json({
        ok: true,
        reports: reports.map((r) => ({
          id: r.id,
          periodLabel: r.periodLabel,
          narrative: r.narrative,
          createdAt: r.createdAt,
          student: {
            id: r.student.id,
            displayName: r.student.user.displayName,
            email: r.student.user.email,
          },
        })),
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Unable to load pending progress reports." },
        { status: 500 },
      );
    }
  },
  [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
);
