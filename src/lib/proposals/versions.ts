import { createHash } from "node:crypto";

import { DocumentType, ProposalStatus } from "@prisma/client";

import {
  assertDocumentsAccessible,
  DocumentRepositoryError,
  getDocumentDownloadUrl,
} from "@/lib/documents";
import { prisma } from "@/lib/prisma/client";
import { STORAGE_URL_EXPIRATION_MS } from "@/lib/storage";
import type { AuthenticatedUserContext } from "@/types/auth";

type ProposalDocumentRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: Date;
};

type LogicalProposalVersion = {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  manifestHash: string;
  submittedAt: Date;
  documents: ProposalDocumentRecord[];
};

export class ProposalVersionError extends Error {
  status: 400 | 403 | 404 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 500 = 400) {
    super(message);
    this.name = "ProposalVersionError";
    this.status = status;
  }
}

async function findProposalVersionRecord(proposalId: string) {
  return prisma.researchProposal.findUnique({
    where: { id: proposalId },
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
              documentType: DocumentType.PROPOSAL,
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
          documentType: DocumentType.PROPOSAL,
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

function legacyManifestHash(documents: ProposalDocumentRecord[]) {
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
  versions: LogicalProposalVersion[];
  documents: ProposalDocumentRecord[];
}): LogicalProposalVersion[] {
  if (record.versions.length > 0) {
    return record.versions;
  }

  const groups = new Map<number, ProposalDocumentRecord[]>();
  for (const document of record.documents) {
    groups.set(document.version, [
      ...(groups.get(document.version) ?? []),
      document,
    ]);
  }

  return [...groups.entries()].map(([versionNumber, documents]) => ({
    id: `legacy-proposal-version-${versionNumber}`,
    versionNumber,
    isCurrent: documents.some((document) => document.isCurrentVersion),
    manifestHash: legacyManifestHash(documents),
    submittedAt: documents[0]?.createdAt ?? new Date(0),
    documents,
  }));
}

export function assertSingleCurrentProposalVersion(
  versions: Array<Pick<LogicalProposalVersion, "isCurrent">>,
) {
  if (
    versions.length === 0 ||
    versions.filter((version) => version.isCurrent).length !== 1
  ) {
    throw new ProposalVersionError(
      "Exactly one logical proposal version must be current.",
      409,
    );
  }
}

function mapVersion(version: LogicalProposalVersion) {
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
  versions: LogicalProposalVersion[],
  auth: AuthenticatedUserContext,
) {
  const documentIds = versions.flatMap((version) =>
    version.documents.map((document) => document.id),
  );
  try {
    await assertDocumentsAccessible(documentIds, auth);
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      throw new ProposalVersionError(error.message, error.status === 410 ? 403 : error.status);
    }
    throw error;
  }
}

export async function getProposalVersions(
  proposalId: string,
  auth: AuthenticatedUserContext,
) {
  const proposal = await findProposalVersionRecord(proposalId);
  if (!proposal) {
    throw new ProposalVersionError("Research proposal not found.", 404);
  }

  const versions = normalizeVersions(proposal);
  assertSingleCurrentProposalVersion(versions);
  await assertVersionAccess(versions, auth);

  return {
    proposal: {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status as ProposalStatus,
      student: {
        id: proposal.student.id,
        displayName: proposal.student.user.displayName,
        email: proposal.student.user.email,
      },
    },
    versions: versions.map(mapVersion),
  };
}

export async function getProposalVersionDownloadUrl(
  proposalId: string,
  versionNumber: number,
  auth: AuthenticatedUserContext,
) {
  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    throw new ProposalVersionError("Invalid proposal version number.", 400);
  }

  const proposal = await findProposalVersionRecord(proposalId);
  if (!proposal) {
    throw new ProposalVersionError("Research proposal not found.", 404);
  }

  const versions = normalizeVersions(proposal);
  assertSingleCurrentProposalVersion(versions);
  const version = versions.find(
    (candidate) => candidate.versionNumber === versionNumber,
  );
  if (!version) {
    throw new ProposalVersionError("Proposal version not found.", 404);
  }

  await assertVersionAccess([version], auth);
  const documents = await Promise.all(
    version.documents.map(async (document) => ({
      ...mapVersion({ ...version, documents: [document] }).documents[0],
      downloadUrl: await getDocumentDownloadUrl(document.id, auth),
    })),
  );

  return {
    proposal: {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
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
