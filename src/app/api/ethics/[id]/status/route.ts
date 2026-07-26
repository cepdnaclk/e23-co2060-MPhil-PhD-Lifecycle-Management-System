import { EthicsRecordStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentEthicsError,
  recordEthicsStatus,
} from "@/lib/ethics/department-record";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  status: z.enum([
    EthicsRecordStatus.APPROVED,
    EthicsRecordStatus.REJECTED,
    EthicsRecordStatus.EXPIRED,
  ]),
  referenceNumber: z.string().trim().max(200).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(5_000).optional(),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid ethics status." },
      { status: 400 },
    );
  }
  try {
    const record = await recordEthicsStatus(
      context.params?.id ?? "",
      parsed.data,
      context.auth,
    );
    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof DepartmentEthicsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record ethics status." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR, UserRole.HOD]);
