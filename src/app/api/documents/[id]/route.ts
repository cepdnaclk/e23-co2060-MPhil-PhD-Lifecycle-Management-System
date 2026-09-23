import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  DocumentRepositoryError,
  getDocumentDownloadUrl,
} from "@/lib/documents";
import { withAuth, type WithAuthContext } from "@/lib/firebase/with-auth";

type Params = { id: string };

export const GET = withAuth(
  async (_request: NextRequest, { params, auth }: WithAuthContext<Params>) => {
    const documentId = params?.id;

    if (!documentId) {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    try {
      const downloadUrl = await getDocumentDownloadUrl(documentId, auth);
      return NextResponse.json({ downloadUrl });
    } catch (error) {
      if (error instanceof DocumentRepositoryError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to generate download link." },
        { status: 500 },
      );
    }
  },
  [
    UserRole.STUDENT,
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
    UserRole.HOD,
  ],
);

export const PATCH = withAuth(
  async (_request: NextRequest, { params }: WithAuthContext<Params>) => {
    const { softDeleteDocument } = await import("@/lib/documents");
    const documentId = params?.id;

    if (!documentId) {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    try {
      await softDeleteDocument(documentId);
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof DocumentRepositoryError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to archive document." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
