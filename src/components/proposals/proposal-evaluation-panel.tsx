"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { proposalEvaluationSchema } from "@/lib/proposals/evaluation-schemas";

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

export function ProposalEvaluationPanel() {
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
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserRole() {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const payload = await response.json();
          setUserRole(payload.role);
        }
      } catch (error) {
        console.error("Failed to fetch user role:", error);
      }
    }
    fetchUserRole();
  }, []);

  useEffect(() => {
    if (!userRole) return;

    async function fetchProposals() {
      setIsListLoading(true);
      try {
        const endpoint =
          userRole === "ADMINISTRATOR"
            ? "/api/admin/proposals"
            : "/api/supervisor/students";

        const response = await fetch(endpoint, {
          credentials: "include",
        });
        const payload = await response.json();

        if (response.ok) {
          if (userRole === "ADMINISTRATOR") {
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
    fetchProposals();
  }, [userRole]);

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

  async function handleReject() {
    const normalizedProposalId = proposalId.trim();

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

  async function handleApprove() {
    const normalizedProposalId = proposalId.trim();

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

  return (
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent px-5 py-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:px-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          {userRole === "ADMINISTRATOR" ? "Admin Review" : "Supervisor Evaluation"}
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-black sm:text-3xl">
          {userRole === "ADMINISTRATOR" ? "Approve research proposals" : "Evaluate a proposal under review"}
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black">
          {userRole === "ADMINISTRATOR" 
            ? "Review pending proposals from all students and provide final approval or request revisions."
            : "Load a proposal by ID, inspect existing evaluation history, and submit a single supervisor evaluation."}
        </p>
      </section>

      {errorMessage ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {successMessage}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6">
            <h2 className="text-xl font-semibold text-black">
              {userRole === "ADMINISTRATOR" ? "All pending proposals" : "Assigned student proposals"}
            </h2>
            <p className="mt-2 text-base leading-6 text-black">
              {userRole === "ADMINISTRATOR" 
                ? "Select a submission from the list below to review its history and status."
                : "Quickly select a proposal from your assigned students to start evaluating."}
            </p>

            <div className="mt-5 space-y-3">
              {isListLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-20 rounded-2xl bg-transparent" />
                  <div className="h-20 rounded-2xl bg-transparent" />
                </div>
              ) : proposalsToReview.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-base text-gray-400">
                  {userRole === "ADMINISTRATOR" 
                    ? "No proposals are currently pending review."
                    : "No assigned students with active proposals found."}
                </div>
              ) : (
                proposalsToReview.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadProposalById(item.id)}
                    className={`group w-full rounded-2xl border p-4 text-left transition ${
                      proposalId === item.id
                        ? "border-gray-300 bg-transparent"
                        : "border-gray-200 bg-transparent hover:border-gray-300 hover:bg-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-black group-hover:text-black">
                          {item.student.displayName}
                        </p>
                        <p className="mt-1 truncate text-base text-black">
                          {item.title}
                        </p>
                      </div>
                      <span className="rounded-full border border-gray-300 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-black">
                        V{item.currentVersion} • {item.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <form
            onSubmit={handleLookup}
            className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6"
          >
            <h2 className="text-xl font-semibold text-black">Load proposal</h2>
            <p className="mt-2 text-base leading-6 text-black">
              Enter the proposal ID to load its evaluation history and status.
            </p>
            <label className="mt-5 block space-y-2 text-base text-black">
              <span>Proposal ID</span>
              <input
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="proposal_abc123"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-5 rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base font-semibold text-black transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? "Loading..." : "Load evaluations"}
            </button>
          </form>

          <form
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6"
          >
            <h2 className="text-xl font-semibold text-black">
              {userRole === "ADMINISTRATOR" ? "Finalize decision" : "Submit evaluation"}
            </h2>
            <p className="mt-2 text-base leading-6 text-black">
              The proposal must already be in the <span className="font-semibold text-black">UNDER_REVIEW</span> state
              {userRole !== "ADMINISTRATOR" && ", and you must be assigned to the student"}.
            </p>

            <div className="mt-5 grid gap-4">
              {userRole !== "ADMINISTRATOR" && (
                <label className="space-y-2 text-base text-black">
                  <span>Score (0-100)</span>
                  <input
                    value={numericalScore}
                    onChange={(event) => setNumericalScore(event.target.value)}
                    type="number"
                    min={0}
                    max={100}
                    className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                    placeholder="85"
                  />
                </label>
              )}

              <label className="space-y-2 text-base text-black">
                <span>{userRole === "ADMINISTRATOR" ? "Decision notes / Feedback" : "Feedback"}</span>
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  className="min-h-44 w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                  placeholder={userRole === "ADMINISTRATOR" 
                    ? "Explain your approval or rejection decision..." 
                    : "Provide at least 50 characters of evaluation feedback..."}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              {userRole !== "ADMINISTRATOR" && (
                <button
                  type="submit"
                  disabled={isSubmitting || isRejecting || isApproving}
                  className="rounded-2xl bg-black px-4 py-3 text-base font-semibold text-black transition hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Submitting..." : "Submit evaluation"}
                </button>
              )}
              {userRole === "ADMINISTRATOR" && (
                <>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={isSubmitting || isRejecting || isApproving}
                    className="rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base font-semibold text-black transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRejecting ? "Rejecting..." : "Reject and request revisions"}
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isSubmitting || isRejecting || isApproving}
                    className="rounded-2xl bg-black px-4 py-3 text-base font-semibold text-black transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isApproving ? "Approving..." : "Approve Proposal"}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        <section className="rounded-[2rem] border border-gray-200 bg-transparent p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:p-6">
          <h2 className="text-xl font-semibold text-black">Evaluation history</h2>
          <p className="mt-2 text-base leading-6 text-black">
            Existing evaluations and the current aggregate score for admin review.
          </p>

          {!result ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-6 text-base text-black">
              Load a proposal to see its evaluation history.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
                <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                  Proposal
                </p>
                <h3 className="mt-2 text-lg font-semibold text-black">
                  {result.proposal.title}
                </h3>
                <p className="mt-2 text-base text-black">
                  Student: {result.proposal.student.displayName}
                </p>
                <p className="mt-1 text-base uppercase tracking-[0.16em] text-gray-400">
                  Status: {result.proposal.status.replaceAll("_", " ")}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
                  <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                    Aggregate Score
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {result.aggregate.averageScore ?? "N/A"}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
                  <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                    Evaluation Count
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {result.aggregate.evaluationCount}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {result.evaluations.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-5 text-base text-black">
                    No evaluations submitted yet.
                  </div>
                ) : (
                  result.evaluations.map((evaluation) => (
                    <article
                      key={evaluation.id}
                      className="rounded-[1.5rem] border border-gray-200 bg-transparent px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-black">
                            {evaluation.evaluator.displayName}
                          </p>
                          <p className="mt-1 text-base uppercase tracking-[0.16em] text-gray-400">
                            Submitted {formatDateLabel(evaluation.submissionDate)}
                          </p>
                        </div>
                        <span className="rounded-full border border-gray-300 bg-transparent px-3 py-1 text-base font-semibold text-black">
                          {evaluation.numericalScore}/100
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-base leading-6 text-black">
                        {evaluation.feedback}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
