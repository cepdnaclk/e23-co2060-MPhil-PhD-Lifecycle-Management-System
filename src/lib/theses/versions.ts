import { createHash } from "node:crypto";

import { DocumentType, ThesisStatus } from "@prisma/client";

import {
  assertDocumentsAccessible,
  DocumentRepositoryError,
  getDocumentDownloadUrl,
} from "@/lib/documents";
import { prisma } from "@/lib/prisma/client";
import { STORAGE_URL_EXPIRATION_MS } from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

type ThesisDocumentRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
};

type LogicalThesisVersion = {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  manifestHash: string;
  submittedAt: Date;
  documents: ThesisDocumentRecord[];
};

export class ThesisVersionError extends Error {
  status: 400 | 403 | 404 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
    this.name = "ThesisVersionError";
    this.status = status;
  }
}

async function findThesisVersionRecord(thesisId: string) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      status: true,
      student: {
        select: {
          id: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
      },
      versions: {
        orderBy: { versionNumber: "asc" },
        select: {
          id: true,
          versionNumber: true,
          isCurrent: true,
          manifestHash: true,
          submittedAt: true,
          documents: {
            where: {
              isDeleted: false,
              documentType: DocumentType.THESIS,
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              storagePath: true,
              mimeType: true,
              version: true,
              isCurrentVersion: true,
              createdAt: true,
            },
          },
        },
      },
      documents: {
        where: {
          isDeleted: false,
          documentType: DocumentType.THESIS,
        },
        orderBy: [{ version: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          fileName: true,
          storagePath: true,
          mimeType: true,
          version: true,
          isCurrentVersion: true,
          createdAt: true,
        },
      },
    },
  });
}

function legacyManifestHash(documents: ThesisDocumentRecord[]) {
  return `legacy-${createHash("sha256")
    .update(
      JSON.stringify(
        documents.map((document) => ({
          id: document.id,
          storagePath: document.storagePath,
        })),
      ),
    )
    .digest("hex")}`;
}

function normalizeVersions(record: {
  versions: LogicalThesisVersion[];
  documents: ThesisDocumentRecord[];
}): LogicalThesisVersion[] {
  if (record.versions.length > 0) {
    return record.versions;
  }

  const groups = new Map<number, ThesisDocumentRecord[]>();
  for (const document of record.documents) {
    groups.set(document.version, [
      ...(groups.get(document.version) ?? []),
      document,
    ]);
  }

  return [...groups.entries()].map(([versionNumber, documents]) => ({
    id: `legacy-thesis-version-${versionNumber}`,
    versionNumber,
    isCurrent: documents.some((document) => document.isCurrentVersion),
    manifestHash: legacyManifestHash(documents),
    submittedAt: documents[0]?.createdAt ?? new Date(0),
    documents,
  }));
}

export function assertSingleCurrentThesisVersion(
  versions: Array<Pick<LogicalThesisVersion, "isCurrent">>,
) {
  if (
    versions.length === 0 ||
    versions.filter((version) => version.isCurrent).length !== 1
  ) {
    throw new ThesisVersionError(
      "Exactly one logical thesis version must be current.",
      409,
    );
  }
}

function mapVersion(version: LogicalThesisVersion) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    isCurrent: version.isCurrent,
    manifestHash: version.manifestHash,
    submittedAt: version.submittedAt,
    documents: version.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      version: document.version,
      isCurrentVersion: document.isCurrentVersion,
      createdAt: document.createdAt,
    })),
  };
}

async function assertVersionAccess(
  versions: LogicalThesisVersion[],
  auth: AuthenticatedUserContext,
) {
  const documentIds = versions.flatMap((version) =>
    version.documents.map((document) => document.id),
  );
  try {
    await assertDocumentsAccessible(documentIds, auth);
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      throw new ThesisVersionError(error.message, error.status === 410 ? 403 : error.status);
    }
    throw error;
  }
}

export async function getThesisVersions(
  thesisId: string,
  auth: AuthenticatedUserContext,
) {
  const thesis = await findThesisVersionRecord(thesisId);
  if (!thesis) {
    throw new ThesisVersionError("Thesis not found.", 404);
  }

  const versions = normalizeVersions(thesis);
  assertSingleCurrentThesisVersion(versions);
  await assertVersionAccess(versions, auth);

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status as ThesisStatus,
      student: {
        id: thesis.student.id,
        displayName: thesis.student.user.displayName,
        email: thesis.student.user.email,
      },
    },
    versions: versions.map(mapVersion),
  };
}

export async function getThesisVersionDownloadUrl(
  thesisId: string,
  versionNumber: number,
  auth: AuthenticatedUserContext,
) {
  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    throw new ThesisVersionError("Invalid thesis version number.", 400);
  }

  const thesis = await findThesisVersionRecord(thesisId);
  if (!thesis) {
    throw new ThesisVersionError("Thesis not found.", 404);
  }

  const versions = normalizeVersions(thesis);
  assertSingleCurrentThesisVersion(versions);
  const version = versions.find(
    (candidate) => candidate.versionNumber === versionNumber,
  );
  if (!version) {
    throw new ThesisVersionError("Thesis version not found.", 404);
  }

  await assertVersionAccess([version], auth);
  const documents = await Promise.all(
    version.documents.map(async (document) => ({
      ...mapVersion({ ...version, documents: [document] }).documents[0],
      downloadUrl: await getDocumentDownloadUrl(document.id, auth),
    })),
  );

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
    },
    version: {
      ...mapVersion(version),
      documents,
    },
    downloads: documents,
    downloadUrl: documents.length === 1 ? documents[0]?.downloadUrl : null,
    expiresInMinutes: STORAGE_URL_EXPIRATION_MS / (60 * 1000),
  };
}

export async function getCurrentThesisDownloadUrl(
  thesisId: string,
  auth: AuthenticatedUserContext,
) {
  const thesis = await findThesisVersionRecord(thesisId);
  if (!thesis) {
    throw new ThesisVersionError("Thesis not found.", 404);
  }

  const versions = normalizeVersions(thesis);
  assertSingleCurrentThesisVersion(versions);
  const currentVersion = versions.find((version) => version.isCurrent);
  if (!currentVersion) {
    throw new ThesisVersionError("Current thesis version not found.", 404);
  }

  await assertVersionAccess([currentVersion], auth);
  const documents = await Promise.all(
    currentVersion.documents.map(async (document) => ({
      ...mapVersion({ ...currentVersion, documents: [document] }).documents[0],
      downloadUrl: await getDocumentDownloadUrl(document.id, auth),
    })),
  );

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      student: {
        id: thesis.student.id,
        displayName: thesis.student.user.displayName,
        email: thesis.student.user.email,
      },
    },
    version: mapVersion(currentVersion),
    documents,
    document: documents.length === 1 ? documents[0] : null,
    downloadUrl: documents.length === 1 ? documents[0]?.downloadUrl : null,
    expiresInMinutes: STORAGE_URL_EXPIRATION_MS / (60 * 1000),
  };
}
