"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { FileUp, RefreshCw } from "lucide-react";

import {
  ethicsApprovalSubmissionSchema,
  ethicsApprovalUploadRequestSchema,
} from "@/lib/ethics/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";

type EthicsDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string;
};

type EthicsApproval = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  documents: EthicsDocument[];
};

type EthicsOverview = {
  approvals: EthicsApproval[];
  latestApproval: EthicsApproval | null;
  canSubmit: boolean;
  submissionBlockedReason: string | null;
  hasActiveRegistration: boolean;
  hasApprovedProposal: boolean;
  error?: string;
};

type UploadedEthicsDocument = {
  fileName: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

async function loadEthicsOverview() {
  const response = await secureFetch("/api/ethics", {
    credentials: "include",
  });
  const payload = (await response.json()) as EthicsOverview;

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load ethics approval workspace.");
  }

  return payload;
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Not reviewed";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EthicsApprovalPanel() {
  const [overview, setOverview] = useState<EthicsOverview | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedEthicsDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function refreshOverview() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextOverview = await loadEthicsOverview();
      setOverview(nextOverview);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load ethics approval workspace.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);

    try {
      const nextDocuments: UploadedEthicsDocument[] = [];
      let approvalId: string | undefined;

      for (const file of selectedFiles) {
        const parsedUploadRequest = ethicsApprovalUploadRequestSchema.safeParse({
          approvalId,
          fileName: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
        });

        if (!parsedUploadRequest.success) {
          throw new Error(
            parsedUploadRequest.error.issues[0]?.message ??
              "Unable to upload the ethics document.",
          );
        }

        const uploadUrlResponse = await secureFetch("/api/ethics/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(parsedUploadRequest.data),
        });
        const uploadUrlPayload = (await uploadUrlResponse.json()) as {
          error?: string;
          approvalId?: string;
          signedUrl?: string;
          storagePath?: string;
        };

        if (
          !uploadUrlResponse.ok ||
          !uploadUrlPayload.signedUrl ||
          !uploadUrlPayload.storagePath ||
          !uploadUrlPayload.approvalId
        ) {
          throw new Error(
            uploadUrlPayload.error ?? "Unable to prepare the ethics document upload.",
          );
        }

        approvalId = uploadUrlPayload.approvalId;

        const uploadResponse = await secureFetch(uploadUrlPayload.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Ethics document upload failed.");
        }

        nextDocuments.push({
          fileName: file.name,
          storagePath: uploadUrlPayload.storagePath,
          mimeType: file.type,
          sizeBytes: file.size,
        });
      }

      setUploadedDocuments(nextDocuments);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload the ethics documents.",
      );
      setUploadedDocuments([]);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (uploadedDocuments.length === 0) {
      setErrorMessage("Upload at least one PDF or ZIP ethics document before submitting.");
      return;
    }

    const parsedSubmission = ethicsApprovalSubmissionSchema.safeParse({
      title,
      summary,
      documents: uploadedDocuments,
    });

    if (!parsedSubmission.success) {
      setErrorMessage(
        parsedSubmission.error.issues[0]?.message ??
          "Invalid ethics approval submission.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await secureFetch("/api/ethics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(parsedSubmission.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        approval?: EthicsApproval;
      };

      if (!response.ok || !payload.approval) {
        throw new Error(payload.error ?? "Ethics approval submission failed.");
      }

      setSuccessMessage("Ethics documents submitted.");
      setTitle("");
      setSummary("");
      setUploadedDocuments([]);
      await refreshOverview();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Ethics approval submission failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const latestApproval = overview?.latestApproval ?? null;

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ethics Approval</h2>
          <p className="text-muted-foreground mt-2">
            Submit ethics clearance evidence after proposal approval.
          </p>
        </div>
        {latestApproval && (
          <Badge
            variant="secondary"
            className="uppercase"
          >
            Submitted
          </Badge>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-500/50 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {successMessage}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>New Ethics Submission</CardTitle>
            <CardDescription>
              Upload the ethics clearance or committee application package as PDF/ZIP documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {!overview?.canSubmit && overview?.submissionBlockedReason ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                  {overview.submissionBlockedReason}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Application title</Label>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Ethics clearance for field study..."
                      disabled={isLoading || isSubmitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Summary</Label>
                    <Textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      className="min-h-[160px]"
                      placeholder="Summarize the ethics scope, participant/data considerations, and approval evidence..."
                      disabled={isLoading || isSubmitting}
                    />
                  </div>

                  <div className="rounded-md border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileUp className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Evidence Documents
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload PDF or ZIP ethics approval, committee form, or clearance documents.
                    </p>
                    <Input
                      type="file"
                      accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                      multiple
                      onChange={handleFileUpload}
                      disabled={isLoading || isUploading}
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
                      <p className="mt-2 text-sm text-muted-foreground">
                        Uploading ethics documents...
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || isSubmitting || isUploading}
                    className="w-full"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Documents"}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Ethics History</CardTitle>
              <CardDescription>
                Review submitted ethics document packages.
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
            {!overview || overview.approvals.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-lg font-semibold">No ethics submissions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your ethics approval history will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {overview.approvals.map((approval) => (
                  <div key={approval.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Submitted {formatDateLabel(approval.createdAt)}
                        </p>
                        <h4 className="mt-1 font-semibold">{approval.title}</h4>
                      </div>
                      <Badge variant="secondary" className="shrink-0">Submitted</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{approval.summary}</p>
                    <div className="space-y-2">
                      {approval.documents.map((document) => (
                        <div
                          key={document.id}
                          className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {document.fileName}
                            </p>
                            <p className="break-all text-xs text-muted-foreground">
                              {document.storagePath}
                            </p>
                          </div>
                          <SubmissionDocumentDownloadButton
                            documentId={document.id}
                            fileName={document.fileName}
                            className="shrink-0"
                          />
                        </div>
                      ))}
                    </div>
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
