"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  proposalSubmissionSchema,
  proposalUploadRequestSchema,
} from "@/lib/proposals/schemas";

type ProposalDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string;
};

type ProposalSummary = {
  id: string;
  title: string;
  abstract: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  currentVersion: number;
  applicationId: string;
  createdAt: string;
  updatedAt: string;
  documents: ProposalDocument[];
};

type ProposalOverviewResponse = {
  proposal: ProposalSummary | null;
  canSubmitNewVersion: boolean;
  submissionBlockedReason: string | null;
  hasActiveRegistration: boolean;
  applicationId: string | null;
  error?: string;
};

type UploadedProposalDocument = {
  fileName: string;
  storagePath: string;
  mimeType: "application/pdf";
  sizeBytes: number;
};

async function loadProposalOverview(): Promise<ProposalOverviewResponse> {
  const response = await fetch("/api/proposals", {
    credentials: "include",
  });
  const payload = (await response.json()) as ProposalOverviewResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load the proposal workspace.");
  }

  return payload;
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleString();
}

function getStatusTone(status: ProposalSummary["status"]) {
  switch (status) {
    case "APPROVED":
      return "border-gray-300 bg-transparent text-black";
    case "REJECTED":
      return "border-gray-300 bg-transparent text-black";
    case "UNDER_REVIEW":
      return "border-gray-300 bg-transparent text-black";
    case "SUBMITTED":
      return "border-gray-300 bg-transparent text-black";
  }
}

export function ProposalSubmissionPanel() {
  const [overview, setOverview] = useState<ProposalOverviewResponse | null>(null);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedProposalDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function refreshOverview() {
    setIsLoading(true);

    try {
      const nextOverview = await loadProposalOverview();
      setOverview(nextOverview);

      if (nextOverview.proposal) {
        setTitle(nextOverview.proposal.title);
        setAbstract(nextOverview.proposal.abstract);
      } else {
        setTitle("");
        setAbstract("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the proposal workspace.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const parsedUploadRequest = proposalUploadRequestSchema.safeParse({
      fileName: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
    });

    if (!parsedUploadRequest.success) {
      setErrorMessage(
        parsedUploadRequest.error.issues[0]?.message ??
          "Unable to upload the proposal PDF.",
      );
      setUploadedDocument(null);
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);

    try {
      const uploadUrlResponse = await fetch("/api/proposals/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          fileName: parsedUploadRequest.data.fileName,
          contentType: parsedUploadRequest.data.contentType,
          fileSizeBytes: parsedUploadRequest.data.fileSizeBytes,
        }),
      });
      const uploadUrlPayload = (await uploadUrlResponse.json()) as {
        error?: string;
        signedUrl?: string;
        storagePath?: string;
      };

      if (
        !uploadUrlResponse.ok ||
        !uploadUrlPayload.signedUrl ||
        !uploadUrlPayload.storagePath
      ) {
        throw new Error(uploadUrlPayload.error ?? "Unable to prepare the proposal upload.");
      }

      const uploadResponse = await fetch(uploadUrlPayload.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Proposal file upload failed.");
      }

      setUploadedDocument({
        fileName: file.name,
        storagePath: uploadUrlPayload.storagePath,
        mimeType: "application/pdf",
        sizeBytes: file.size,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload the proposal PDF.",
      );
      setUploadedDocument(null);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!uploadedDocument) {
      setErrorMessage("Upload a PDF proposal before submitting.");
      return;
    }

    const parsedSubmission = proposalSubmissionSchema.safeParse({
      title,
      abstract,
      document: uploadedDocument,
    });

    if (!parsedSubmission.success) {
      setErrorMessage(
        parsedSubmission.error.issues[0]?.message ??
          "Invalid proposal submission.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(parsedSubmission.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        proposal?: ProposalSummary;
      };

      if (!response.ok || !payload.proposal) {
        throw new Error(payload.error ?? "Proposal submission failed.");
      }

      setSuccessMessage(
        payload.proposal.currentVersion > 1
          ? `Proposal version ${payload.proposal.currentVersion} submitted successfully.`
          : "Proposal submitted successfully.",
      );
      setUploadedDocument(null);
      await refreshOverview();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Proposal submission failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const proposal = overview?.proposal ?? null;

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent px-5 py-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:px-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Research Proposal
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-black sm:text-3xl">
              Proposal submission and version history
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-6 text-black">
              Upload your initial proposal as a PDF, or submit a revised version
              only after a rejection. Every version remains visible in the
              repository history.
            </p>
          </div>
          {proposal ? (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-base font-semibold ${getStatusTone(proposal.status)}`}
            >
              {proposal.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {successMessage}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-black">
                {proposal ? "Submit a revised proposal" : "Submit your proposal"}
              </h2>
              <p className="mt-2 text-base leading-6 text-black">
                Upload a PDF up to 50MB. The newest file becomes the current
                version while earlier versions stay in the database.
              </p>
            </div>
            {proposal ? (
              <div className="rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-right">
                <p className="text-base uppercase tracking-[0.16em] text-gray-400">
                  Current version
                </p>
                <p className="mt-1 text-lg font-semibold text-black">
                  V{proposal.currentVersion}
                </p>
              </div>
            ) : null}
          </div>

          {!overview?.canSubmitNewVersion && overview?.submissionBlockedReason ? (
            <div className="mt-5 rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
              {overview.submissionBlockedReason}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <label className="space-y-2 text-base text-black">
              <span>Proposal title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="Explainable AI for postgraduate supervision workflows"
                disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
              />
            </label>

            <label className="space-y-2 text-base text-black">
              <span>Abstract</span>
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                className="min-h-44 w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="Summarize your proposed problem, methodology, and expected contribution."
                disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
              />
            </label>

            <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
              <p className="text-base font-medium text-black">Upload proposal PDF</p>
              <p className="mt-2 text-base text-black">
                Only PDF documents are accepted. Maximum size: 50MB.
              </p>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={isLoading || !overview?.canSubmitNewVersion || isUploading}
                className="mt-4 block w-full text-base text-black file:mr-4 file:rounded-2xl file:border-0 file:bg-black file:px-4 file:py-3 file:font-semibold file:text-black"
              />
              {isUploading ? (
                <p className="mt-3 text-base text-black">Uploading proposal PDF...</p>
              ) : null}
              {uploadedDocument ? (
                <div className="mt-4 rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
                  {uploadedDocument.fileName} ready for submission.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-black">
              {proposal
                ? "Resubmissions create a new document version and keep all prior versions intact."
                : "Your first submission creates version 1 and opens the proposal review workflow."}
            </p>
            <button
              type="submit"
              disabled={
                isLoading ||
                isSubmitting ||
                isUploading ||
                !overview?.canSubmitNewVersion
              }
              className="rounded-2xl bg-black px-4 py-3 text-base font-semibold text-black transition hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Submitting..." : proposal ? "Submit revised proposal" : "Submit proposal"}
            </button>
          </div>
        </form>

        <section className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-black">Proposal history</h2>
              <p className="mt-2 text-base leading-6 text-black">
                Review the latest status and every stored file version.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshOverview()}
              disabled={isLoading}
              className="rounded-2xl border border-gray-300 px-4 py-2 text-base font-semibold text-black transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-[1.5rem] border border-gray-200 bg-transparent px-4 py-6 text-base text-black">
              Loading proposal workspace...
            </div>
          ) : !proposal ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-6 text-base text-black">
              No proposal has been submitted yet.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
                <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                  Current proposal
                </p>
                <h3 className="mt-2 text-lg font-semibold text-black">{proposal.title}</h3>
                <p className="mt-1 text-base font-mono text-black">ID: {proposal.id}</p>
                <p className="mt-3 whitespace-pre-wrap text-base leading-6 text-black">
                  {proposal.abstract}
                </p>
                <p className="mt-4 text-base uppercase tracking-[0.18em] text-gray-400">
                  Updated {formatDateLabel(proposal.updatedAt)}
                </p>
              </div>

              <div className="space-y-3">
                {proposal.documents.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-[1.5rem] border border-gray-200 bg-transparent px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-black">{document.fileName}</p>
                        <p className="mt-1 text-base uppercase tracking-[0.18em] text-gray-400">
                          Version {document.version} • {document.mimeType}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-base font-semibold ${
                          document.isCurrentVersion
                            ? "border border-gray-300 bg-transparent text-black"
                            : "border border-gray-300 bg-transparent text-black"
                        }`}
                      >
                        {document.isCurrentVersion ? "Current" : "Previous"}
                      </span>
                    </div>
                    <p className="mt-3 break-all text-base leading-5 text-black">
                      {document.storagePath}
                    </p>
                    <p className="mt-2 text-base uppercase tracking-[0.16em] text-gray-400">
                      Stored {formatDateLabel(document.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
