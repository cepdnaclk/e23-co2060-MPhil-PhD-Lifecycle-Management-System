import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  createThesisUploadUrl,
  ThesisSubmissionError,
} from "@/lib/theses/submission";

export const POST = withAuth(
  async (request: NextRequest, context) => {
    try {
      const uploadSession = await createThesisUploadUrl(
        await request.json(),
        context.auth,
      );
      return NextResponse.json(uploadSession, { status: 201 });
    } catch (error) {
      if (error instanceof ThesisSubmissionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        { error: "Unable to prepare the thesis upload." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
