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
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusBadge(status: ProposalSummary["status"]) {
  switch (status) {
    case "APPROVED":
      return "border-2 border-black bg-white text-black";
    case "REJECTED":
      return "border-2 border-black bg-white text-black";
    case "UNDER_REVIEW":
      return "border-2 border-black bg-white text-black";
    case "SUBMITTED":
      return "border border-gray-300 bg-white text-black";
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
    <div className="space-y-10">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Research Workspace
            </p>
            <h1 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              Proposals
            </h1>
            <p className="max-w-2xl text-xl font-medium leading-relaxed text-black/80">
              Submit and manage your research proposals. New versions can be 
              uploaded following academic feedback or rejection.
            </p>
          </div>
          {proposal && (
            <div className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest ${getStatusBadge(proposal.status)}`}>
              {proposal.status.replaceAll("_", " ")}
            </div>
          )}
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{successMessage}</p>
        </div>
      )}

      <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <form
            onSubmit={handleSubmit}
            className="rounded-[24px] border border-gray-300 bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-black">
                  {proposal ? "Revise Proposal" : "New Submission"}
                </h2>
                <p className="mt-3 text-base font-medium leading-6 text-black/70">
                  Version control remains enabled for academic integrity and review history.
                </p>
              </div>
              {proposal && (
                <div className="rounded-[24px] border border-gray-300 bg-white px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-black/40">Version</p>
                  <p className="mt-1 text-xl font-black text-black">V{proposal.currentVersion}</p>
                </div>
              )}
            </div>

            {!overview?.canSubmitNewVersion && overview?.submissionBlockedReason ? (
              <div className="mt-6 rounded-2xl border-2 border-black bg-white px-5 py-4 text-base font-bold text-black">
                {overview.submissionBlockedReason}
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <label className="block space-y-2">
                  <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                    Proposal Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-lg font-bold text-black outline-none transition placeholder:text-black/20 focus:bg-gray-50"
                    placeholder="Research title..."
                    disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                    Abstract
                  </span>
                  <textarea
                    value={abstract}
                    onChange={(event) => setAbstract(event.target.value)}
                    className="min-h-44 w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-base font-medium text-black outline-none transition placeholder:text-black/20 focus:bg-gray-50"
                    placeholder="Summarize your research methodology and impact..."
                    disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
                  />
                </label>

                <div className="rounded-[24px] border border-gray-300 bg-white p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-black/40">
                    Document Upload
                  </p>
                  <p className="mt-3 text-base font-medium text-black/70">
                    Upload a PDF document to create a new version for review.
                  </p>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    disabled={isLoading || !overview?.canSubmitNewVersion || isUploading}
                    className="mt-5 block w-full text-sm text-black file:mr-4 file:rounded-[0.75em] file:border-2 file:border-black file:bg-black file:px-5 file:py-3 file:text-xs file:font-black file:uppercase file:tracking-widest file:text-white"
                  />
                  {uploadedDocument && (
                    <div className="mt-5 rounded-2xl border-2 border-black bg-white px-4 py-3 text-sm font-bold text-black">
                      {uploadedDocument.fileName}
                    </div>
                  )}
                  {isUploading ? (
                    <p className="mt-3 text-sm font-medium text-black/70">Uploading proposal PDF...</p>
                  ) : null}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isLoading || isSubmitting || isUploading || !overview?.canSubmitNewVersion}
                    className="group inline-block cursor-pointer rounded-[0.75em] bg-black text-sm font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black px-8 py-3 text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                      {isSubmitting ? "Processing..." : proposal ? "Submit Revision" : "Send Proposal"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <section className="space-y-8">
          <div className="rounded-[24px] border border-gray-300 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-black">History</h2>
                <p className="mt-3 text-base font-medium text-black/70">
                  Every proposal version stays visible in the repository.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshOverview()}
                disabled={isLoading}
                className="rounded-xl border-2 border-black px-5 py-3 text-xs font-black uppercase tracking-widest text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {!proposal ? (
              <div className="mt-8 rounded-[24px] border border-dashed border-gray-300 bg-white px-5 py-12 text-center">
                <p className="text-2xl font-black tracking-tight text-black">Repository Empty</p>
                <p className="mt-2 text-base font-medium text-black/70">
                  Submit your first proposal to start version tracking.
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-4">
                {proposal.documents.map((doc) => (
                  <article
                    key={doc.id}
                    className="group rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/40 transition-colors group-hover:text-white/70">
                          Version {doc.version}
                        </p>
                        <h4 className="mt-2 truncate text-2xl font-black tracking-tight text-black transition-colors group-hover:text-white">
                          {doc.fileName}
                        </h4>
                      </div>
                      <span className="rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
                        {doc.isCurrentVersion ? "Latest" : "Archived"}
                      </span>
                    </div>
                    <p className="mt-4 break-all text-base font-medium text-black/70 transition-colors group-hover:text-white/80">
                      {doc.storagePath}
                    </p>
                    <p className="mt-3 text-[12px] font-black uppercase tracking-widest text-black/40 transition-colors group-hover:text-white/70">
                      {formatDateLabel(doc.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
