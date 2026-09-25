import { NextResponse } from "next/server";

import {
  ApplicationSubmissionError,
  verifyApplicationDocument,
} from "@/lib/applications/submission";
import { createServerErrorResponse } from "@/lib/http/errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const uploadedDocument = await verifyApplicationDocument(body);

    return NextResponse.json(uploadedDocument);
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return createServerErrorResponse({
      error,
      message: "Unable to verify the uploaded document.",
      route: "/api/applications/upload/verify",
      method: "POST",
    });
  }
}
