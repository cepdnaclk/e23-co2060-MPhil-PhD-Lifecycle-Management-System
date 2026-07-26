import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentExaminationError,
  recordHodReadinessDecision,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum(["APPROVED", "RETURNED"]),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid HOD readiness decision." }, { status: 400 });
  }
  try {
    const readiness = await recordHodReadinessDecision(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ readiness });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to record HOD readiness decision." },
      { status: 500 },
    );
  }
}, [UserRole.HOD]);
