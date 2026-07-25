import { NextResponse } from "next/server";
import { ApplicationStatus, Prisma, UserRole } from "@prisma/client";

import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";
import {
  ApplicationSubmissionError,
  createApplicationSubmission,
} from "@/lib/applications/submission";
import { createServerErrorResponse } from "@/lib/http/errors";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const application = await createApplicationSubmission(body);

    return NextResponse.json(
      {
        application: {
          id: application.id,
          status: application.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return createServerErrorResponse({
      error,
      message: "Unable to submit the application.",
      route: "/api/applications",
      method: "POST",
    });
  }
}

export const GET = withAuth(
  async (request) => {
    try {
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      const status = statusParam
        ? Object.values(ApplicationStatus).find((value) => value === statusParam)
        : undefined;

      if (statusParam && !status) {
        return NextResponse.json(
          { error: "Invalid application status." },
          { status: 400 },
        );
      }

      const whereClause: Prisma.ApplicationWhereInput = {
        isArchived: false,
        ...(status ? { status } : {}),
      };

      const applications = await prisma.application.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc",
        },
      });

      return NextResponse.json({ applications });
    } catch (error) {
      return createServerErrorResponse({
        error,
        message: "Unable to retrieve applications.",
        route: "/api/applications",
        method: "GET",
      });
    }
  },
  [UserRole.ADMINISTRATOR],
);
