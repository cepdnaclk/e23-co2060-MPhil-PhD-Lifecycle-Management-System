"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { proposalEvaluationSchema } from "@/lib/proposals/evaluation-schemas";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
type ReviewerRole = "ADMINISTRATOR" | "SUPERVISOR";

type EvaluationPayload = {
  proposal: {
    id: string;
    title: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
    student: {
      id: string;
      displayName: string;
      email: string;
    };
  };
  evaluations: Array<{
    id: string;
    numericalScore: number;
    feedback: string;
    submissionDate: string;
    evaluator: {
      supervisorId: string;
      userId: string;
      displayName: string;
      email: string;
    };
  }>;
  aggregate: {
    evaluationCount: number;
    averageScore: number | null;
  };
  error?: string;
};

function formatDateLabel(value: string) {
  return new Date(value).toLocaleString();
}

export function ProposalEvaluationPanel({
  reviewerRole,
}: {
  reviewerRole: ReviewerRole;
}) {
  const [proposalId, setProposalId] = useState("");
  const [numericalScore, setNumericalScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<EvaluationPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [proposalsToReview, setProposalsToReview] = useState<any[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    type: "APPROVED" | "REJECTED" | null;
  }>({ show: false, type: null });
  const isAdmin = reviewerRole === "ADMINISTRATOR";

  useEffect(() => {
    async function fetchProposals() {
      setIsListLoading(true);
      try {
        const endpoint =
          isAdmin
            ? "/api/admin/proposals"
            : "/api/supervisor/students";

        const response = await fetch(endpoint, {
          credentials: "include",
        });
        const payload = await response.json();

        if (response.ok) {
          if (isAdmin) {
            setProposalsToReview(payload.proposals || []);
          } else {
            // Normalize supervisor students to match proposal list format
            const normalized = (payload.students || [])
              .filter((item: any) => item.latestProposal)
              .map((item: any) => ({
                id: item.latestProposal.id,
                title: item.latestProposal.title,
                status: item.latestProposal.status,
                currentVersion: item.latestProposal.currentVersion,
                student: {
                  id: item.student.id,
                  displayName: item.student.displayName,
                },
              }));
            setProposalsToReview(normalized);
          }
        }
      } catch (error) {
        console.error("Failed to load proposals for review:", error);
      } finally {
        setIsListLoading(false);
      }
    }
    void fetchProposals();
  }, [isAdmin]);

  async function loadProposalById(id: string) {
    setProposalId(id);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/proposals/${id}/evaluations`, {
        credentials: "include",
      });
      
      const responseText = await response.text();
      let payload: EvaluationPayload;

      try {
        payload = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse proposal evaluations response:", responseText);
        throw new Error(`Invalid response from server (${response.status}). Please check console logs.`);
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load proposal evaluations.");
      }

      setResult(payload);
    } catch (error) {
      setResult(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load proposal evaluations.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedProposalId = proposalId.trim();

    if (!normalizedProposalId) {
      setErrorMessage("Enter a proposal ID before loading evaluations.");
      return;
    }

    await loadProposalById(normalizedProposalId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedProposalId = proposalId.trim();

    if (!normalizedProposalId) {
      setErrorMessage("Enter a proposal ID before submitting an evaluation.");
      return;
    }

    if (!numericalScore.trim()) {
      setErrorMessage("Enter a score between 0 and 100 before submitting.");
      return;
    }

    const parsedEvaluation = proposalEvaluationSchema.safeParse({
      numericalScore: Number(numericalScore),
      feedback,
    });

    if (!parsedEvaluation.success) {
      setErrorMessage(
        parsedEvaluation.error.issues[0]?.message ??
          "Invalid proposal evaluation.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/proposals/${normalizedProposalId}/evaluations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(parsedEvaluation.data),
      });
      const payload = (await response.json()) as {
        evaluation?: unknown;
        aggregate?: EvaluationPayload["aggregate"];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit the proposal evaluation.");
      }

      setSuccessMessage("Proposal evaluation submitted successfully.");
      setNumericalScore("");
      setFeedback("");

      const refreshResponse = await fetch(`/api/proposals/${normalizedProposalId}/evaluations`, {
        credentials: "include",
      });
      const refreshPayload = (await refreshResponse.json()) as EvaluationPayload;

      if (refreshResponse.ok) {
        setResult(refreshPayload);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the proposal evaluation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeReject() {
    const normalizedProposalId = proposalId.trim();
    setShowConfirmModal({ show: false, type: null });

    if (!normalizedProposalId) {
      setErrorMessage("Load a proposal before requesting revisions.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!feedback.trim() || feedback.length < 50) {
      setErrorMessage(
        "Provide at least 50 characters of feedback explaining the rejection before requesting revisions.",
      );
      return;
    }

    setIsRejecting(true);

    try {
      const response = await fetch(`/api/proposals/${normalizedProposalId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status: "REJECTED",
          feedback,
        }),
      });
      const payload = (await response.json()) as {
        proposal?: unknown;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reject the proposal.");
      }

      setSuccessMessage(
        "Proposal rejected successfully. The student has been notified to submit a revised version.",
      );
      setNumericalScore("");
      setFeedback("");

      await loadProposalById(normalizedProposalId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reject the proposal.",
      );
    } finally {
      setIsRejecting(false);
    }
  }

  function handleReject() {
    if (!proposalId) {
      setErrorMessage("Load a proposal before requesting revisions.");
      return;
    }
    if (!feedback.trim() || feedback.length < 50) {
      setErrorMessage("Provide at least 50 characters of feedback explaining the rejection.");
      return;
    }
    setShowConfirmModal({ show: true, type: "REJECTED" });
  }

  async function executeApprove() {
    const normalizedProposalId = proposalId.trim();
    setShowConfirmModal({ show: false, type: null });

    if (!normalizedProposalId) {
      setErrorMessage("Load a proposal before approving it.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    setIsApproving(true);

    try {
      const response = await fetch(`/api/proposals/${normalizedProposalId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status: "APPROVED",
          feedback: feedback || "Proposal approved after review.",
        }),
      });
      const payload = (await response.json()) as {
        proposal?: unknown;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to approve the proposal.");
      }

      setSuccessMessage(
        "Proposal approved successfully. The student research plan has been unlocked.",
      );
      setNumericalScore("");
      setFeedback("");

      await loadProposalById(normalizedProposalId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to approve the proposal.",
      );
    } finally {
      setIsApproving(false);
    }
  }

  function handleApprove() {
    if (!proposalId) {
      setErrorMessage("Load a proposal before approving it.");
      return;
    }
    setShowConfirmModal({ show: true, type: "APPROVED" });
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <Dialog
        open={showConfirmModal.show}
        onOpenChange={(open) => {
          if (!open) setShowConfirmModal({ show: false, type: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showConfirmModal.type === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {showConfirmModal.type === "APPROVED" ? "approve" : "reject"} this research proposal?
              {result && (
                <div className="mt-2 font-medium text-foreground">
                  Candidate: {result.proposal.student.displayName}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal({ show: false, type: null })}
            >
              Cancel
            </Button>
            <Button
              variant={showConfirmModal.type === "APPROVED" ? "default" : "destructive"}
              onClick={showConfirmModal.type === "APPROVED" ? executeApprove : executeReject}
            >
              Yes, Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {isAdmin ? "Approve Proposals" : "Review Proposals"}
          </h2>
          <p className="text-muted-foreground mt-2">
            {isAdmin
              ? "Review pending proposals and approve or request revisions."
              : "Review assigned proposals and submit evaluations."}
          </p>
        </div>
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

      <div className="grid gap-6 md:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {isAdmin ? "All pending proposals" : "Assigned student proposals"}
              </CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Select a proposal to review its status and history."
                  : "Select a proposal to load it for review."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isListLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-20 rounded-md bg-muted/50" />
                    <div className="h-20 rounded-md bg-muted/50" />
                  </div>
                ) : proposalsToReview.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {isAdmin ? "No proposals pending review." : "No assigned proposals found."}
                  </div>
                ) : (
                  proposalsToReview.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadProposalById(item.id)}
                      className={`w-full rounded-md border p-4 text-left transition-colors ${
                        proposalId === item.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {item.student.displayName}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {item.title}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 self-start">
                          V{item.currentVersion} • {item.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Load proposal</CardTitle>
              <CardDescription>
                Enter a proposal ID to load its status and evaluation history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div className="space-y-2">
                  <Label>Proposal ID</Label>
                  <Input
                    value={proposalId}
                    onChange={(event) => setProposalId(event.target.value)}
                    placeholder="proposal_abc123"
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? "Loading..." : "Load evaluations"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {isAdmin ? "Finalize decision" : "Submit evaluation"}
              </CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Approve or reject the proposal with feedback."
                  : "Submit a score and feedback for the selected proposal."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4">
                  {!isAdmin && (
                    <div className="space-y-2">
                      <Label>Score (0-100)</Label>
                      <Input
                        value={numericalScore}
                        onChange={(event) => setNumericalScore(event.target.value)}
                        type="number"
                        min={0}
                        max={100}
                        placeholder="85"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{isAdmin ? "Decision notes / Feedback" : "Feedback"}</Label>
                    <Textarea
                      value={feedback}
                      onChange={(event) => setFeedback(event.target.value)}
                      className="min-h-[160px]"
                      placeholder={isAdmin
                        ? "Explain your approval or rejection decision..." 
                        : "Provide at least 50 characters of evaluation feedback..."}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {!isAdmin && (
                    <Button
                      type="submit"
                      disabled={isSubmitting || isRejecting || isApproving}
                      className="w-full sm:w-auto"
                    >
                      {isSubmitting ? "Submitting..." : "Submit evaluation"}
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleReject}
                        disabled={isSubmitting || isRejecting || isApproving}
                        className="w-full sm:w-auto"
                      >
                        {isRejecting ? "Rejecting..." : "Reject & Request Revisions"}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleApprove}
                        disabled={isSubmitting || isRejecting || isApproving}
                        className="w-full sm:w-auto"
                      >
                        {isApproving ? "Approving..." : "Approve Proposal"}
                      </Button>
                    </>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Evaluation history</CardTitle>
            <CardDescription>
              Review submitted evaluations and the current aggregate score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Load a proposal to view its evaluation history.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-md border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Proposal
                  </p>
                  <h3 className="font-semibold">{result.proposal.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Student: {result.proposal.student.displayName}
                  </p>
                  <Badge className="mt-2 uppercase" variant="outline">
                    {result.proposal.status.replaceAll("_", " ")}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-md border p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Aggregate Score
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {result.aggregate.averageScore ?? "N/A"}
                    </p>
                  </div>
                  <div className="rounded-md border p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Evaluation Count
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {result.aggregate.evaluationCount}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                    Feedback Details
                  </h4>
                  {result.evaluations.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No evaluations submitted yet.</p>
                  ) : (
                    result.evaluations.map((evaluation) => (
                      <div
                        key={evaluation.id}
                        className="rounded-md border p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">
                              {evaluation.evaluator.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Submitted {formatDateLabel(evaluation.submissionDate)}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {evaluation.numericalScore}/100
                          </Badge>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {evaluation.feedback}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
