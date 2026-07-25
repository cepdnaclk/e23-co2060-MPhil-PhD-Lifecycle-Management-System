import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import {
  abortUploadSession,
  UploadSessionError,
} from "@/lib/uploads/sessions";

export const DELETE = withAuth(
  async (_request, context) => {
    try {
      await abortUploadSession(context.params?.id ?? "", context.auth);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      if (error instanceof UploadSessionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json(
        { error: "Unable to abort the upload session." },
        { status: 500 },
      );
    }
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
  ],
);
