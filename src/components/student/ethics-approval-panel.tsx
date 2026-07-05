"use client";

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

type EthicsStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

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
  status: EthicsStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
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
  mimeType: "application/pdf";
  sizeBytes: number;
};

async function loadEthicsOverview() {
  const response = await fetch("/api/ethics", {
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

function getStatusBadge(status: EthicsStatus) {
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

export function EthicsApprovalPanel() {
  const [overview, setOverview] = useState<EthicsOverview | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedEthicsDocument | null>(null);
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
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const parsedUploadRequest = ethicsApprovalUploadRequestSchema.safeParse({
      fileName: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
    });

    if (!parsedUploadRequest.success) {
      setErrorMessage(
        parsedUploadRequest.error.issues[0]?.message ??
          "Unable to upload the ethics approval PDF.",
      );
      setUploadedDocument(null);
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);

    try {
      const uploadUrlResponse = await fetch("/api/ethics/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(parsedUploadRequest.data),
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
        throw new Error(
          uploadUrlPayload.error ?? "Unable to prepare the ethics approval upload.",
        );
      }

      const uploadResponse = await fetch(uploadUrlPayload.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Ethics approval file upload failed.");
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
          : "Unable to upload the ethics approval PDF.",
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
      setErrorMessage("Upload a PDF ethics approval document before submitting.");
      return;
    }

    const parsedSubmission = ethicsApprovalSubmissionSchema.safeParse({
      title,
      summary,
      document: uploadedDocument,
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
      const response = await fetch("/api/ethics", {
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

      setSuccessMessage("Ethics approval submitted for administrator review.");
      setTitle("");
      setSummary("");
      setUploadedDocument(null);
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
            variant={getStatusBadge(latestApproval.status)}
            className="uppercase"
          >
            {latestApproval.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
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
          <CardHeader>
            <CardTitle>New Ethics Submission</CardTitle>
            <CardDescription>
              Upload the ethics clearance or committee application package as a PDF.
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
                        Evidence PDF
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a PDF ethics approval, committee form, or clearance document.
                    </p>
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileUpload}
                      disabled={isLoading || isUploading}
                    />
                    {uploadedDocument && (
                      <div className="mt-4 rounded-md border bg-muted/30 p-2 text-sm font-medium">
                        {uploadedDocument.fileName}
                      </div>
                    )}
                    {isUploading && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Uploading ethics approval PDF...
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || isSubmitting || isUploading}
                    className="w-full"
                  >
                    {isSubmitting ? "Submitting..." : "Submit for Review"}
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
                Review submission status and administrator notes.
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
                      <Badge variant={getStatusBadge(approval.status)} className="shrink-0">
                        {approval.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{approval.summary}</p>
                    {approval.reviewNotes && (
                      <div className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="font-semibold">Review notes</p>
                        <p className="mt-1 text-muted-foreground">{approval.reviewNotes}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      {approval.documents.map((document) => (
                        <p
                          key={document.id}
                          className="break-all text-xs text-muted-foreground"
                        >
                          {document.fileName}: {document.storagePath}
                        </p>
                      ))}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Reviewed {formatDateLabel(approval.reviewedAt)}
                      {approval.reviewedByName ? ` by ${approval.reviewedByName}` : ""}
                    </p>
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
