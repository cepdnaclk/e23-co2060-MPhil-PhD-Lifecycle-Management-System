import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  decideMilestoneProgress,
  MilestoneProgressError,
} from "@/lib/progress-reports/milestone-workflow";

const schema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("RETURN"),
    reason: z.string().trim().min(10).max(2_000),
  }),
  z.object({
    decision: z.literal("APPROVE"),
    reason: z.string().trim().max(2_000).optional(),
  }),
]);

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid decision." },
      { status: 400 },
    );
  }
  try {
    const report = await decideMilestoneProgress(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof MilestoneProgressError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to decide progress." }, { status: 500 });
  }
}, [UserRole.SUPERVISOR]);
