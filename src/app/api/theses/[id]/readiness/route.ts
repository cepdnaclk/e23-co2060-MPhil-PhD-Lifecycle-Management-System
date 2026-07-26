import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  certifyThesisReadiness,
  DepartmentExaminationError,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum(["CERTIFIED", "RETURNED"]),
  checklist: z.record(z.string(), z.boolean()),
  comments: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid readiness decision." }, { status: 400 });
  }
  try {
    const certification = await certifyThesisReadiness(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ certification });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to certify readiness." }, { status: 500 });
  }
}, [UserRole.SUPERVISOR]);
