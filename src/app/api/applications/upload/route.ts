import { NextResponse } from "next/server";

import {
  ApplicationSubmissionError,
  deleteUploadedApplicationDocument,
  uploadApplicationDocument,
} from "@/lib/applications/submission";

export async function POST(request: Request) {
  const formData = await request.formData();
  const draftId = formData.get("draftId");
  const file = formData.get("file");

  try {
    const uploadedDocument = await uploadApplicationDocument({
      draftId: typeof draftId === "string" ? draftId : "",
      file,
    });

    return NextResponse.json(uploadedDocument, { status: 201 });
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to upload the document." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as {
    draftId?: string;
    storagePath?: string;
  };

  try {
    await deleteUploadedApplicationDocument({
      draftId: body.draftId ?? "",
      storagePath: body.storagePath ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApplicationSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to remove the document." },
      { status: 500 },
    );
  }
}
