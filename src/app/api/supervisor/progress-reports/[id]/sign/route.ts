import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

type Params = {
  id: string;
};

export const POST = withAuth(
  async (_request: NextRequest, { params, auth }) => {
    try {
      if (!params?.id) {
        return NextResponse.json({ error: "Progress report id is required." }, { status: 400 });
      }

      const supervisor = await prisma.supervisor.findUnique({
        where: { userId: auth.userId },
        select: { id: true },
      });

      if (!supervisor && auth.role !== UserRole.ADMINISTRATOR) {
        return NextResponse.json({ error: "Supervisor profile not found." }, { status: 404 });
      }

      const report = await prisma.progressReport.findUnique({
        where: { id: params.id },
        include: {
          student: {
            include: {
              supervisorAssignments: true,
            },
          },
        },
      });

      if (!report) {
        return NextResponse.json({ error: "Progress report not found." }, { status: 404 });
      }

      // Check if supervisor is assigned to this student (or is admin)
      const isAssigned = report.student.supervisorAssignments.some(
        (a) => a.supervisorId === supervisor?.id,
      );

      if (!isAssigned && auth.role !== UserRole.ADMINISTRATOR) {
        return NextResponse.json(
          { error: "You are not authorized to sign off on this report." },
          { status: 403 },
        );
      }

      const updatedReport = await prisma.progressReport.update({
        where: { id: params.id },
        data: {
          isSupervisorSignedOff: true,
          supervisorSignedOffAt: new Date(),
          supervisorSignedOffById: supervisor?.id,
        },
      });

      return NextResponse.json({ ok: true, report: updatedReport });
    } catch (error) {
      return NextResponse.json(
        { error: "Unable to sign off on progress report." },
        { status: 500 },
      );
    }
  },
  [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
);
