import { ProposalStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

export const GET = withAuth(
  async (_request: NextRequest) => {
    try {
      const proposals = await prisma.researchProposal.findMany({
        where: {
          status: {
            in: [ProposalStatus.SUBMITTED, ProposalStatus.UNDER_REVIEW],
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          title: true,
          status: true,
          currentVersion: true,
          updatedAt: true,
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
        },
      });

      return NextResponse.json({
        ok: true,
        proposals: proposals.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          currentVersion: p.currentVersion,
          updatedAt: p.updatedAt,
          student: {
            id: p.student.id,
            displayName: p.student.user.displayName,
            email: p.student.user.email,
          },
        })),
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Unable to load pending proposals for review." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
