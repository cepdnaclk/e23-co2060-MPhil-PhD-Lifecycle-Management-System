import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { withAuth } from "@/lib/firebase/with-auth";
import { createServerErrorResponse } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { getDocumentDownloadUrl } from "@/lib/documents";

type RouteParams = {
  id: string;
  docId: string;
};

export const GET = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    try {
      const applicationId = context.params?.id;
      const documentId = context.params?.docId;

      if (!applicationId || !documentId) {
        return NextResponse.json({ error: "Application ID and Document ID are required." }, { status: 400 });
      }

      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          applicationId: applicationId,
          isDeleted: false,
        },
      });

      if (!document) {
        return NextResponse.json({ error: "Document not found." }, { status: 404 });
      }

      const signedUrl = await getDocumentDownloadUrl(document.id, context.auth);

      return NextResponse.json({
        document: {
          id: document.id,
          fileName: document.fileName,
          mimeType: document.mimeType,
          storagePath: document.storagePath,
          isCurrentVersion: document.isCurrentVersion,
        },
        downloadUrl: signedUrl,
        expiresInMinutes: 15, // Default expiration from STORAGE_URL_EXPIRATION_MS
      });
    } catch (error) {
      return createServerErrorResponse({
        error,
        message: "Unable to generate document download link.",
        route: `/api/applications/${context.params?.id ?? "unknown"}/documents/${context.params?.docId ?? "unknown"}/download`,
        method: "GET",
      });
    }
  },
  [UserRole.ADMINISTRATOR],
);
