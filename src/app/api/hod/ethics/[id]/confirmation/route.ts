import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  confirmEthicsByHod,
  DepartmentEthicsError,
} from "@/lib/ethics/department-record";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum(["CONFIRM", "RETURN", "REJECT"]),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(
  async (request: NextRequest, context) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid HOD ethics decision.",
        },
        { status: 400 },
      );
    }
    try {
      return NextResponse.json({
        record: await confirmEthicsByHod(
          context.params?.id ?? "",
          parsed.data,
          context.auth,
        ),
      });
    } catch (error) {
      if (error instanceof DepartmentEthicsError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      return NextResponse.json(
        { error: "Unable to record the HOD ethics decision." },
        { status: 500 },
      );
    }
  },
  [UserRole.HOD],
);
