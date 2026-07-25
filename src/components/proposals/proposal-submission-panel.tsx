"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  proposalSubmissionSchema,
  proposalUploadRequestSchema,
} from "@/lib/proposals/schemas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileUp, RefreshCw } from "lucide-react";
import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";

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
};

async function loadProposalOverview(): Promise<ProposalOverviewResponse> {
  const response = await secureFetch("/api/proposals", {
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
      return "default";
    case "REJECTED":
      return "destructive";
    case "UNDER_REVIEW":
      return "secondary";
    case "SUBMITTED":
      return "outline";
  }
}

export function ProposalSubmissionPanel() {
  const [overview, setOverview] = useState<ProposalOverviewResponse | null>(null);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedProposalDocument[]>([]);
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
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
    if (isSubmitting) {
      event.target.value = "";
      return;
    }

    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    if (selectedFiles.length > 10) {
      setErrorMessage("Upload no more than 10 proposal documents in one version.");
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);
    let preparedSessionId: string | null = null;

    try {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
        setUploadSessionId(null);
        setUploadedDocuments([]);
      }

      const parsedUploadRequest = proposalUploadRequestSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        files: selectedFiles.map((file) => ({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })),
      });

      if (!parsedUploadRequest.success) {
        throw new Error(
          parsedUploadRequest.error.issues[0]?.message ??
            "Unable to upload the proposal document.",
        );
      }

      const uploadUrlResponse = await secureFetch("/api/proposals/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(parsedUploadRequest.data),
      });
      const uploadUrlPayload = (await uploadUrlResponse.json()) as {
        error?: string;
        uploadSessionId?: string;
        uploads?: Array<{
          fileId: string;
          fileName: string;
          signedUrl: string | null;
          storagePath: string;
        }>;
      };

      if (
        !uploadUrlResponse.ok ||
        !uploadUrlPayload.uploadSessionId ||
        uploadUrlPayload.uploads?.length !== selectedFiles.length
      ) {
        throw new Error(uploadUrlPayload.error ?? "Unable to prepare the proposal upload.");
      }
      preparedSessionId = uploadUrlPayload.uploadSessionId;

      for (const [index, file] of selectedFiles.entries()) {
        const target = uploadUrlPayload.uploads[index];
        if (!target?.signedUrl) {
          throw new Error(`No upload target was returned for ${file.name}.`);
        }
        const uploadResponse = await secureFetch(target.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error(`Proposal file upload failed for ${file.name}.`);
        }
      }

      setUploadSessionId(uploadUrlPayload.uploadSessionId);
      setUploadedDocuments(
        uploadUrlPayload.uploads.map((target) => ({
          fileName: target.fileName,
          storagePath: target.storagePath,
        })),
      );
    } catch (error) {
      if (preparedSessionId) {
        await secureFetch(`/api/uploads/${preparedSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload the proposal documents.",
      );
      setUploadedDocuments([]);
      setUploadSessionId(null);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (uploadedDocuments.length === 0 || !uploadSessionId) {
      setErrorMessage("Upload at least one PDF or ZIP proposal document before submitting.");
      return;
    }

    const parsedSubmission = proposalSubmissionSchema.safeParse({
      title,
      abstract,
      uploadSessionId,
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
      const response = await secureFetch("/api/proposals", {
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
      setUploadedDocuments([]);
      setUploadSessionId(null);
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
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Proposals</h2>
          <p className="text-muted-foreground mt-2">
            Submit proposals and new versions after feedback.
          </p>
        </div>
        {proposal && (
          <Badge variant={getStatusBadge(proposal.status)} className="uppercase">
            {proposal.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive-foreground">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>
                {proposal ? "Revise Proposal" : "New Submission"}
              </CardTitle>
              <CardDescription>
                All versions remain available for review.
              </CardDescription>
            </div>
            {proposal && (
              <div className="rounded-md border bg-muted/50 px-3 py-1 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version</p>
                <p className="text-sm font-bold">V{proposal.currentVersion}</p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {!overview?.canSubmitNewVersion && overview?.submissionBlockedReason ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive-foreground">
                  {overview.submissionBlockedReason}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Proposal Title</Label>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Research title..."
                      disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Abstract</Label>
                    <Textarea
                      value={abstract}
                      onChange={(event) => setAbstract(event.target.value)}
                      className="min-h-[160px]"
                      placeholder="Summarize your research methodology and impact..."
                      disabled={isLoading || !overview?.canSubmitNewVersion || isSubmitting}
                    />
                  </div>

                  <div className="rounded-md border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileUp className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-semibold uppercase tracking-wider text-muted-foreground text-xs">
                        Document Upload
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload 1–10 PDF or ZIP files as one proposal version.
                      Selecting again creates a replacement upload session.
                    </p>
                    <Input
                      type="file"
                      multiple
                      accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                      onChange={handleFileUpload}
                      disabled={
                        isLoading ||
                        !overview?.canSubmitNewVersion ||
                        isUploading ||
                        isSubmitting
                      }
                    />
                    {uploadedDocuments.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {uploadedDocuments.map((document) => (
                          <div key={document.storagePath} className="rounded-md border bg-muted/30 p-2 text-sm font-medium">
                            {document.fileName}
                          </div>
                        ))}
                      </div>
                    )}
                    {isUploading && (
                      <p className="mt-2 text-sm text-muted-foreground">Uploading proposal documents...</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || isSubmitting || isUploading || !overview?.canSubmitNewVersion}
                    className="w-full"
                  >
                    {isSubmitting ? "Processing..." : proposal ? "Submit Revision" : "Submit Proposal"}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>History</CardTitle>
              <CardDescription>
                All proposal versions remain available here.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshOverview()}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {!proposal ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-lg font-semibold">No proposal submitted</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Submit your first proposal to start version tracking.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposal.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-md border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Version {doc.version}
                        </p>
                        <h4 className="mt-1 font-semibold truncate">
                          {doc.fileName}
                        </h4>
                      </div>
                      <Badge variant={doc.isCurrentVersion ? "default" : "secondary"} className="shrink-0">
                        {doc.isCurrentVersion ? "Latest" : "Archived"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">
                      {doc.storagePath}
                    </p>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {formatDateLabel(doc.createdAt)}
                    </p>
                    <SubmissionDocumentDownloadButton
                      documentId={doc.id}
                      fileName={doc.fileName}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
