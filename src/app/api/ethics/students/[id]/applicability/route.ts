import { EthicsApplicability, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentEthicsError,
  recordEthicsApplicability,
} from "@/lib/ethics/department-record";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  applicability: z.enum([
    EthicsApplicability.REQUIRED,
    EthicsApplicability.NOT_REQUIRED,
  ]),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ethics applicability." }, { status: 400 });
  }
  try {
    const record = await recordEthicsApplicability(
      context.params?.id ?? "",
      parsed.data.applicability,
      parsed.data.notes,
      context.auth,
    );
    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof DepartmentEthicsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record applicability." }, { status: 500 });
  }
}, [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR, UserRole.HOD]);
