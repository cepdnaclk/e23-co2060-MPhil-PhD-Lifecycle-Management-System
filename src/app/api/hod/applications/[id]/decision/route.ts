import { DepartmentDecision, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentApplicationError,
  recordHodAdmissionDecision,
} from "@/lib/applications/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum([
    DepartmentDecision.APPROVED,
    DepartmentDecision.REVISION_REQUIRED,
    DepartmentDecision.REJECTED,
  ]),
  reason: z.string().trim().min(10).max(5_000),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid decision." },
      { status: 400 },
    );
  }

  try {
    const application = await recordHodAdmissionDecision(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof DepartmentApplicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record decision." }, { status: 500 });
  }
}, [UserRole.HOD]);
