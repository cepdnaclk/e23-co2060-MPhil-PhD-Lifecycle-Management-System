import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  assignProposalReviewer,
  DepartmentApplicationError,
} from "@/lib/applications/department-workflow";
import { withAuth } from "@/lib/firebase/with-auth";

const schema = z.object({ reviewerUserId: z.string().min(1) });

export const POST = withAuth<{ id: string }>(async (request: NextRequest, context) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Reviewer is required." }, { status: 400 });
  }

  try {
    const assignment = await assignProposalReviewer(
      context.params?.id ?? "",
      parsed.data.reviewerUserId,
      context.auth,
    );
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentApplicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to assign reviewer." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR]);
