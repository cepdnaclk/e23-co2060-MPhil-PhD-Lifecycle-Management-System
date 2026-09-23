"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { CheckCircle2, ExternalLink, FileText, Loader2 } from "lucide-react";

type EvaluationRecord = {
  id: string;
  feedback: string;
  submissionDate: string | Date;
  examiner: { userId: string };
};

type ProposalItem = {
  id: string;
  title: string;
  abstract: string;
  status: string;
  currentVersion: number;
  updatedAt: string | Date;
  evaluations: EvaluationRecord[];
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "APPROVED") return "default";
  if (status === "UNDER_REVIEW") return "secondary";
  return "outline";
}

export function SupervisorProposalEvaluationPanel({
  proposals,
  supervisorUserId,
}: {
  proposals: ProposalItem[];
  supervisorUserId: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  async function downloadPdf(proposalId: string, version: number) {
    setDownloadBusy(proposalId);
    setDownloadErrors((prev) => ({ ...prev, [proposalId]: "" }));
    try {
      const response = await secureFetch(
        `/api/proposals/${proposalId}/versions/${version}/download`,
        { method: "GET" },
      );
      const payload = (await response.json()) as {
        downloadUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Could not generate download link.");
      }
      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadErrors((prev) => ({
        ...prev,
        [proposalId]: err instanceof Error ? err.message : "Download failed.",
      }));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function submitEvaluation(proposalId: string) {
    const text = feedback[proposalId]?.trim() ?? "";
    if (text.length < 10) {
      setErrors((prev) => ({
        ...prev,
        [proposalId]: "Feedback must be at least 10 characters.",
      }));
      return;
    }

    setBusy(proposalId);
    setErrors((prev) => ({ ...prev, [proposalId]: "" }));

    try {
      const response = await secureFetch(`/api/proposals/${proposalId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: text, documents: [] }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Evaluation submission failed.");
      }

      setSubmitted((prev) => ({ ...prev, [proposalId]: true }));
      router.refresh();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [proposalId]: err instanceof Error ? err.message : "Submission failed.",
      }));
    } finally {
      setBusy(null);
    }
  }

  if (proposals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">
          No research proposals to evaluate. Proposals will appear here once your
          assigned students submit them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {proposals.map((proposal) => {
        const myEvaluation = proposal.evaluations.find(
          (e) => e.examiner.userId === supervisorUserId,
        );
        const alreadySubmitted = !!myEvaluation || submitted[proposal.id];

        return (
          <Card key={proposal.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle>{proposal.title}</CardTitle>
                  <CardDescription>
                    {proposal.student.user.displayName} &middot;{" "}
                    {proposal.student.user.email}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{proposal.currentVersion}</Badge>
                  <Badge variant={statusVariant(proposal.status)}>
                    {proposal.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-5">
                {proposal.abstract}
              </p>
              <p className="text-xs text-muted-foreground">
                Last updated: {formatDate(proposal.updatedAt)}
              </p>

              {/* PDF Download */}
              <div className="flex items-center gap-3">
                <Button
                  id={`download-pdf-${proposal.id}`}
                  variant="outline"
                  size="sm"
                  disabled={downloadBusy === proposal.id}
                  onClick={() => void downloadPdf(proposal.id, proposal.currentVersion)}
                >
                  {downloadBusy === proposal.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  View Proposal PDF
                </Button>
                {downloadErrors[proposal.id] && (
                  <span className="text-sm text-destructive">
                    {downloadErrors[proposal.id]}
                  </span>
                )}
              </div>
              {alreadySubmitted ? (
                <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Evaluation submitted
                    </p>
                    {myEvaluation && (
                      <>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          Submitted on {formatDate(myEvaluation.submissionDate)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {myEvaluation.feedback}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-md border p-4">
                  <p className="text-sm font-medium">Submit Evaluation</p>
                  <Textarea
                    id={`feedback-${proposal.id}`}
                    placeholder="Enter your evaluation feedback for this proposal (at least 10 characters)..."
                    rows={5}
                    value={feedback[proposal.id] ?? ""}
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        [proposal.id]: e.target.value,
                      }))
                    }
                    disabled={busy === proposal.id}
                  />
                  {errors[proposal.id] && (
                    <p className="text-sm text-destructive">{errors[proposal.id]}</p>
                  )}
                  <Button
                    id={`submit-evaluation-${proposal.id}`}
                    disabled={
                      busy === proposal.id ||
                      (feedback[proposal.id]?.trim().length ?? 0) < 10
                    }
                    onClick={() => void submitEvaluation(proposal.id)}
                  >
                    {busy === proposal.id ? "Submitting…" : "Submit Evaluation"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
