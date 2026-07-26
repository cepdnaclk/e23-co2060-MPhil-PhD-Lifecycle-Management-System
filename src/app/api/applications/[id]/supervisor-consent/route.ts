import { SupervisorConsentStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  DepartmentApplicationError,
  recordProposedSupervisorConsent,
} from "@/lib/applications/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({
  decision: z.enum([
    SupervisorConsentStatus.CONSENTED,
    SupervisorConsentStatus.DECLINED,
  ]),
});

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid consent decision." }, { status: 400 });
  }

  try {
    const application = await recordProposedSupervisorConsent(
      context.params?.id ?? "",
      parsed.data.decision,
      context.auth,
    );
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof DepartmentApplicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to record consent." }, { status: 500 });
  }
}, [UserRole.SUPERVISOR]);
