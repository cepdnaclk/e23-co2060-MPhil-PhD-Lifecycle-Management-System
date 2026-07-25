"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader } from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";

type ProposalStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

type ProposalListItem = {
  id: string;
  title: string;
  status: ProposalStatus;
  currentVersion: number;
  updatedAt: string;
  student: {
    id: string;
    displayName: string;
    email: string;
  };
};

type ProposalListResponse = {
  proposals?: ProposalListItem[];
  error?: string;
};

export function ProposalEvaluationPanel() {
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyStatus, setBusyStatus] = useState<ProposalStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadProposals() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await secureFetch("/api/admin/proposals", {
        credentials: "include",
      });
      const payload = (await response.json()) as ProposalListResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load proposals.");
      }

      setProposals(payload.proposals ?? []);
      setSelectedProposalId((current) =>
        current && payload.proposals?.some((proposal) => proposal.id === current)
          ? current
          : payload.proposals?.[0]?.id ?? null,
      );
    } catch (error) {
      setProposals([]);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load proposals.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProposals();
  }, []);

  async function updateStatus(status: ProposalStatus) {
    if (!selectedProposalId) {
      return;
    }

    setBusyStatus(status);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await secureFetch(`/api/proposals/${selectedProposalId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status,
          feedback,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update proposal status.");
      }

      setSuccessMessage(`Proposal marked ${status.replaceAll("_", " ").toLowerCase()}.`);
      setFeedback("");
      await loadProposals();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update proposal status.");
    } finally {
      setBusyStatus(null);
    }
  }

  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? null;

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="mb-8 flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Proposal Decisions</h2>
          <p className="mt-2 text-muted-foreground">
            Review examiner/text feedback separately, then finalize proposals with optional comments.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadProposals()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm font-medium text-destructive-foreground">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-500/50 bg-green-50 p-4 text-sm font-medium text-green-800">
          {successMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-12 text-muted-foreground">
          <Loader />
          <span>Loading proposals...</span>
        </div>
      ) : proposals.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-lg font-semibold">No proposals waiting for decision</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Submitted and under-review proposals will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Submitted Proposals</CardTitle>
              <CardDescription>Select a proposal to finalize.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {proposals.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => setSelectedProposalId(proposal.id)}
                  className={`w-full rounded-md border p-4 text-left transition ${
                    selectedProposalId === proposal.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{proposal.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {proposal.student.displayName} - {proposal.student.email}
                      </p>
                    </div>
                    <Badge variant="outline">V{proposal.currentVersion}</Badge>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {proposal.status.replaceAll("_", " ")}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{selectedProposal?.title ?? "Proposal"}</CardTitle>
              <CardDescription>
                Decisions are textual. Numeric marks are not used in this workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProposal && (
                <div className="rounded-md border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">{selectedProposal.student.displayName}</p>
                  <p className="text-muted-foreground">{selectedProposal.student.email}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Current status: {selectedProposal.status.replaceAll("_", " ")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin comments</label>
                <Textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  className="min-h-[140px]"
                  placeholder="Add comments for the student if anything needs clarification."
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="destructive"
                  disabled={!selectedProposal || busyStatus !== null}
                  onClick={() => void updateStatus("REJECTED")}
                >
                  {busyStatus === "REJECTED" ? "Rejecting..." : "Request Revisions"}
                </Button>
                <Button
                  disabled={!selectedProposal || busyStatus !== null}
                  onClick={() => void updateStatus("APPROVED")}
                >
                  {busyStatus === "APPROVED" ? "Approving..." : "Approve Proposal"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
