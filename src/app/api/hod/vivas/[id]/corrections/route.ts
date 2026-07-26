import { CorrectionType, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentCompletionError,
  orderVivaCorrections,
} from "@/lib/completion/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  requirementType: z.nativeEnum(CorrectionType),
  requirements: z.string().trim().min(20).max(10_000),
  dueDate: z.coerce.date().optional(),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid correction order." }, { status: 400 });
  }
  try {
    const order = await orderVivaCorrections(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to order corrections." }, { status: 500 });
  }
}, [UserRole.HOD]);
