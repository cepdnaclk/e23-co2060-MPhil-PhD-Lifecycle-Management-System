"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { secureFetch } from "@/lib/security/client-request";

type ProposalItem = {
  id: string;
  title: string;
  abstract: string;
  status: string;
  currentVersion: number;
  updatedAt: string | Date;
  student: {
    user: { displayName: string; email: string };
  };
  evaluations: Array<{
    id: string;
    feedback: string;
    submissionDate: string | Date;
    examiner: {
      user: { displayName: string; email: string };
    };
  }>;
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ProposalApprovalPanel({ proposals }: { proposals: ProposalItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  async function downloadProposal(proposal: ProposalItem) {
    setDownloadBusy(proposal.id);
    setErrors((current) => ({ ...current, [proposal.id]: "" }));

    try {
      const response = await secureFetch(
        `/api/proposals/${proposal.id}/versions/${proposal.currentVersion}/download`,
        { method: "GET" },
      );
      const payload = (await response.json()) as {
        downloadUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Could not generate the download link.");
      }

      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [proposal.id]: error instanceof Error ? error.message : "Download failed.",
      }));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function approveProposal(proposal: ProposalItem) {
    if (!window.confirm(`Approve the proposal “${proposal.title}”?`)) return;

    setBusy(proposal.id);
    setErrors((current) => ({ ...current, [proposal.id]: "" }));

    try {
      const response = await secureFetch(`/api/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Proposal approval failed.");
      }

      router.refresh();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [proposal.id]: error instanceof Error ? error.message : "Proposal approval failed.",
      }));
    } finally {
      setBusy(null);
    }
  }

  if (proposals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">No proposals are awaiting review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {proposals.map((proposal) => (
        <Card key={proposal.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{proposal.title}</CardTitle>
                <CardDescription>
                  {proposal.student.user.displayName} &middot; {proposal.student.user.email}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{proposal.currentVersion}</Badge>
                <Badge variant={proposal.status === "APPROVED" ? "default" : "secondary"}>
                  {proposal.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {proposal.abstract}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Last updated: {formatDate(proposal.updatedAt)}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Examiner feedback</h3>
              {proposal.evaluations.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No examiner feedback has been submitted yet.
                </p>
              ) : (
                proposal.evaluations.map((evaluation) => (
                  <div key={evaluation.id} className="rounded-md border p-4">
                    <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {evaluation.examiner.user.displayName} &middot; {evaluation.examiner.user.email}
                      </span>
                      <span>{formatDate(evaluation.submissionDate)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{evaluation.feedback}</p>
                  </div>
                ))
              )}
            </div>

            {errors[proposal.id] && (
              <p role="alert" className="text-sm text-destructive">
                {errors[proposal.id]}
              </p>
            )}

            <div className="flex flex-wrap gap-3 border-t pt-4">
              <Button
                variant="outline"
                disabled={downloadBusy === proposal.id}
                onClick={() => void downloadProposal(proposal)}
              >
                {downloadBusy === proposal.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                View Proposal PDF
              </Button>

              {proposal.status === "APPROVED" ? (
                <div className="flex items-center text-sm font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Proposal approved
                </div>
              ) : (
                <Button
                  disabled={busy === proposal.id}
                  onClick={() => void approveProposal(proposal)}
                >
                  {busy === proposal.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {busy === proposal.id ? "Approving…" : "Approve Proposal"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
