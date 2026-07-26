import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  listStudentMilestones,
  MilestoneProgressError,
  submitMilestoneProgress,
} from "@/lib/progress-reports/milestone-workflow";

const schema = z.object({
  milestoneId: z.string().min(1),
  narrative: z.string().trim().min(20).max(20_000),
  changeSummary: z.string().trim().max(2_000).optional(),
  uploadSessionId: z.string().uuid().optional(),
});

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    try {
      return NextResponse.json(await listStudentMilestones(context.auth));
    } catch (error) {
      if (error instanceof MilestoneProgressError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to load fixed progress milestones." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);

export const POST = withAuth(
  async (request: NextRequest, context) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid milestone report." },
        { status: 400 },
      );
    }
    try {
      const { milestoneId, ...input } = parsed.data;
      const report = await submitMilestoneProgress(
        milestoneId,
        input,
        context.auth,
      );

      return NextResponse.json({ report }, { status: 201 });
    } catch (error) {
      if (error instanceof MilestoneProgressError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to submit progress report." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
