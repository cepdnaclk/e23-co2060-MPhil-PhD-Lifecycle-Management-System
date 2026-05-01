"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

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
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "REJECTED":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "UNDER_REVIEW":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "SUBMITTED":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
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
          fileName: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
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

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          title,
          abstract,
          document: uploadedDocument,
        }),
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
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 px-5 py-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Research Proposal
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">
              Proposal submission and version history
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Upload your initial proposal as a PDF, or submit a revised version
              only after a rejection. Every version remains visible in the
              repository history.
            </p>
          </div>
          {proposal ? (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(proposal.status)}`}
            >
              {proposal.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-[1.5rem] border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                {proposal ? "Submit a revised proposal" : "Submit your proposal"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Upload a PDF up to 50MB. The newest file becomes the current
                version while earlier versions stay in the database.
              </p>
            </div>
            {proposal ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-right">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Current version
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  V{proposal.currentVersion}
                </p>
              </div>
            ) : null}
          </div>

          {!overview?.canSubmitNewVersion && overview?.submissionBlockedReason ? (
            <div className="mt-5 rounded-[1.5rem] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {overview.submissionBlockedReason}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <label className="space-y-2 text-sm text-slate-200">
              <span>Proposal title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                placeholder="Explainable AI for postgraduate supervision workflows"
                disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
              />
            </label>

            <label className="space-y-2 text-sm text-slate-200">
              <span>Abstract</span>
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                className="min-h-44 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                placeholder="Summarize your proposed problem, methodology, and expected contribution."
                disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
              />
            </label>

            <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/80 p-4">
              <p className="text-sm font-medium text-white">Upload proposal PDF</p>
              <p className="mt-2 text-sm text-slate-400">
                Only PDF documents are accepted. Maximum size: 50MB.
              </p>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={isLoading || !overview?.canSubmitNewVersion || isUploading}
                className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-sky-400 file:px-4 file:py-3 file:font-semibold file:text-slate-950"
              />
              {isUploading ? (
                <p className="mt-3 text-sm text-sky-200">Uploading proposal PDF...</p>
              ) : null}
              {uploadedDocument ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {uploadedDocument.fileName} ready for submission.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
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
              className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Submitting..." : proposal ? "Submit revised proposal" : "Submit proposal"}
            </button>
          </div>
        </form>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Proposal history</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Review the latest status and every stored file version.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshOverview()}
              disabled={isLoading}
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-[1.5rem] border border-slate-800 bg-slate-900/70 px-4 py-6 text-sm text-slate-400">
              Loading proposal workspace...
            </div>
          ) : !proposal ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
              No proposal has been submitted yet.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Current proposal
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">{proposal.title}</h3>
                <p className="mt-1 text-xs font-mono text-sky-300">ID: {proposal.id}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {proposal.abstract}
                </p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Updated {formatDateLabel(proposal.updatedAt)}
                </p>
              </div>

              <div className="space-y-3">
                {proposal.documents.map((document) => (
                  <article
                    key={document.id}
                    className="rounded-[1.5rem] border border-slate-800 bg-slate-900/80 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{document.fileName}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          Version {document.version} • {document.mimeType}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          document.isCurrentVersion
                            ? "border border-sky-400/30 bg-sky-500/10 text-sky-100"
                            : "border border-slate-700 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {document.isCurrentVersion ? "Current" : "Previous"}
                      </span>
                    </div>
                    <p className="mt-3 break-all text-xs leading-5 text-slate-400">
                      {document.storagePath}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
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
