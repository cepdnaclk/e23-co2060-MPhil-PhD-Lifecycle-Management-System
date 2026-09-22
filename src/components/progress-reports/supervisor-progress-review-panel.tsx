"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, FileText, Loader2, RotateCcw } from "lucide-react";

import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

type ProgressReport = {
  id: string;
  periodLabel: string;
  narrative: string;
  status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
  currentVersion: number;
  submittedAt: string | null;
  returnReason: string | null;
  approvedAt: string | null;
  documents: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    version: number;
    isCurrentVersion: boolean;
  }>;
  student: {
    id: string;
    displayName: string;
    email: string;
  };
};

type ReportsPayload = {
  reports: ProgressReport[];
  error?: string;
};

async function fetchReports(url: string) {
  const response = await secureFetch(url);
  const payload = (await response.json()) as ReportsPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load progress reports.");
  }

  return payload;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function SupervisorProgressReviewPanel() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/supervisor/progress-reports",
    fetchReports,
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function decide(report: ProgressReport, decision: "APPROVE" | "RETURN") {
    const supervisorComments = comments[report.id]?.trim() ?? "";
    const minimumLength = decision === "RETURN" ? 10 : 5;

    if (supervisorComments.length < minimumLength) {
      setMessages((current) => ({
        ...current,
        [report.id]: `Enter at least ${minimumLength} characters of supervisor comments.`,
      }));
      return;
    }

    const actionLabel =
      decision === "APPROVE" ? "sign off" : "return for revision";
    if (!window.confirm(`Are you sure you want to ${actionLabel} this progress report?`)) {
      return;
    }

    setBusy(report.id);
    setMessages((current) => ({ ...current, [report.id]: "" }));

    try {
      const response = await secureFetch(
        `/api/supervisor/progress-reports/${report.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: supervisorComments,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to record the decision.");
      }

      setComments((current) => ({ ...current, [report.id]: "" }));
      setMessages((current) => ({
        ...current,
        [report.id]:
          decision === "APPROVE"
            ? "Progress report signed off."
            : "Progress report returned for revision.",
      }));
      await mutate();
    } catch (caught) {
      setMessages((current) => ({
        ...current,
        [report.id]:
          caught instanceof Error
            ? caught.message
            : "Unable to record the decision.",
      }));
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-md border bg-muted" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Unable to load progress reports."}
      </div>
    );
  }

  if (data.reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Progress Report Reviews</CardTitle>
          <CardDescription>
            Submitted reports from your assigned students will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          No progress reports are available.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="progress-report-reviews-heading">
      <div>
        <h3 id="progress-report-reviews-heading" className="text-xl font-semibold">
          Progress Report Reviews
        </h3>
        <p className="text-sm text-muted-foreground">
          Review submitted work, provide comments, and record your decision.
        </p>
      </div>

      {data.reports.map((report) => {
        const canDecide = report.status === "SUBMITTED";
        const currentDocuments = report.documents.filter(
          (document) => document.isCurrentVersion,
        );

        return (
          <Card key={report.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{report.student.displayName}</CardTitle>
                  <CardDescription>
                    {report.student.email} &middot; {report.periodLabel} &middot; Version{" "}
                    {report.currentVersion}
                  </CardDescription>
                </div>
                <Badge variant={report.status === "APPROVED" ? "default" : "secondary"}>
                  {report.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Submitted {formatDate(report.submittedAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm">{report.narrative}</p>
              </div>

              {currentDocuments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Supporting evidence</p>
                  {currentDocuments.map((document) => (
                    <div
                      key={document.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <span className="truncate text-sm">{document.fileName}</span>
                      <SubmissionDocumentDownloadButton
                        documentId={document.id}
                        fileName={document.fileName}
                      />
                    </div>
                  ))}
                </div>
              )}

              {report.returnReason && report.status === "RETURNED" && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Returned with comments: {report.returnReason}
                </p>
              )}

              {canDecide && (
                <div className="space-y-3 border-t pt-4">
                  <label htmlFor={`supervisor-comments-${report.id}`} className="text-sm font-medium">
                    Supervisor comments
                  </label>
                  <Textarea
                    id={`supervisor-comments-${report.id}`}
                    rows={4}
                    maxLength={2_000}
                    placeholder="Enter feedback on the submitted progress report."
                    value={comments[report.id] ?? ""}
                    disabled={busy === report.id}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [report.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={busy === report.id}
                      onClick={() => void decide(report, "APPROVE")}
                    >
                      {busy === report.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Sign Off Progress Report
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy === report.id}
                      onClick={() => void decide(report, "RETURN")}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Return for Revision
                    </Button>
                  </div>
                </div>
              )}

              {messages[report.id] && (
                <p role="status" className="text-sm text-muted-foreground">
                  {messages[report.id]}
                </p>
              )}

              {report.status === "APPROVED" && (
                <p className="flex items-center text-sm font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Signed off {formatDate(report.approvedAt)}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
