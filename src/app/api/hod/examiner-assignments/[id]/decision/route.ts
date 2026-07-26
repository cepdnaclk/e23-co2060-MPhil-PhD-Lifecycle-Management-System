import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  confirmThesisExaminerAssignment,
  DepartmentExaminationError,
} from "@/lib/examination/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) });

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment decision." }, { status: 400 });
  }
  try {
    const assignment = await confirmThesisExaminerAssignment(
      context.params?.id ?? "",
      parsed.data.decision,
      context.auth,
    );
    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof DepartmentExaminationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to confirm assignment." }, { status: 500 });
  }
}, [UserRole.HOD]);
