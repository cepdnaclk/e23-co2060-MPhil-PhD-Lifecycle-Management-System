import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  declareEthicsNotRequired,
  DepartmentEthicsError,
} from "@/lib/ethics/department-record";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  applicability: z.literal("NOT_REQUIRED"),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(20).max(5_000),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth(
  async (request: NextRequest, context) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid ethics applicability declaration.",
        },
        { status: 400 },
      );
    }

    try {
      const record = await declareEthicsNotRequired(
        parsed.data,
        context.auth,
      );
      return NextResponse.json({ record }, { status: 201 });
    } catch (error) {
      if (error instanceof DepartmentEthicsError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to submit the ethics declaration." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
