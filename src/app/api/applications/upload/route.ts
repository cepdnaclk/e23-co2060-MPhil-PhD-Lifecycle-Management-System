import { NextResponse } from "next/server";

import {
  ApplicationSubmissionError,
  deleteUploadedApplicationDocument,
} from "@/lib/applications/submission";
import { createServerErrorResponse } from "@/lib/http/errors";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct document uploads are required. Refresh the application page and try again.",
    },
    { status: 410 },
  );
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      draftId?: string;
      draftToken?: string;
      storagePath?: string;
    };
    await deleteUploadedApplicationDocument({
      draftId: body.draftId ?? "",
      draftToken: body.draftToken ?? "",
      storagePath: body.storagePath ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return createServerErrorResponse({
      error,
      message: "Unable to remove the document.",
      route: "/api/applications/upload",
      method: "DELETE",
    });
  }
}
