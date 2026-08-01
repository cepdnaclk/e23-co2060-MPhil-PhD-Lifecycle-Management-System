"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DecisionReviewDialog } from "@/components/ui/decision-review-dialog";
import { WorkflowFeedback } from "@/components/ui/workflow-feedback";
import { Label } from "@/components/ui/label";

type ApplicationDetails = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  researchArea: string;
  supervisor: string | null;
  statementOfPurpose: string;
  programType: string;
  status: string;
  departmentDecision: string;
  supervisorConsentStatus: string;
  studyMode: string;
  proposalTitle: string | null;
  proposalAbstract: string | null;
  createdAt: string;
  documents: {
    id: string;
    fileName: string;
    mimeType: string;
  }[];
};

type ReviewerOption = {
  id: string;
  displayName: string;
  email: string;
  role: "SUPERVISOR" | "EXAMINER";
  isActive: boolean;
};

export function ApplicationReviewPanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    type: "UNDER_REVIEW" | "EXECUTE" | null;
  }>({ show: false, type: null });

  useEffect(() => {
    async function fetchDetails() {
      try {
        const [res, supervisorsResponse, examinersResponse] = await Promise.all([
          secureFetch(`/api/applications/${applicationId}`),
          secureFetch("/api/admin/users?role=SUPERVISOR"),
          secureFetch("/api/admin/users?role=EXAMINER"),
        ]);
        if (!res.ok) throw new Error("Failed to load application details");
        const data = await res.json();
        setApplication(data.application);
        const supervisorPayload = supervisorsResponse.ok
          ? ((await supervisorsResponse.json()) as { users: ReviewerOption[] })
          : { users: [] };
        const examinerPayload = examinersResponse.ok
          ? ((await examinersResponse.json()) as { users: ReviewerOption[] })
          : { users: [] };
        setReviewers(
          [...supervisorPayload.users, ...examinerPayload.users].filter(
            (reviewer) => reviewer.isActive,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    void fetchDetails();
  }, [applicationId]);

  const handleDownload = async (docId: string) => {
    try {
      const res = await secureFetch(`/api/applications/${applicationId}/documents/${docId}/download`);
      if (!res.ok) throw new Error("Failed to get download link");
      const data = await res.json();

      // Open the signed URL in a new tab
      window.open(data.downloadUrl, "_blank");
    } catch {
      setError("Failed to download document. Please try again.");
    }
  };

  const assignReviewer = async () => {
    if (!selectedReviewerId) return;
    setIsUpdating(true);
    try {
      const response = await secureFetch(
        `/api/applications/${applicationId}/proposal-reviewers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewerUserId: selectedReviewerId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to assign reviewer.");
      setSelectedReviewerId("");
      setMessage("Proposal reviewer assigned.");
      setCompletedAt(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to assign reviewer.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStatus = async () => {
    const status = showConfirmModal.type;
    if (!status) return;

    setIsUpdating(true);
    setError(null);
    setMessage(null);

    try {
      const executeAdmission = status === "EXECUTE";
      const res = await secureFetch(
        executeAdmission
          ? `/api/admin/applications/${applicationId}/execute-admission`
          : `/api/admin/applications/${applicationId}/start-review`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      setApplication((current) => current ? {
        ...current,
        status: executeAdmission ? "ADMITTED" : "UNDER_REVIEW",
      } : current);
      setMessage(executeAdmission ? "Admission executed and the Student lifecycle created." : "Department review started.");
      setCompletedAt(new Date());
      setShowConfirmModal({ show: false, type: null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred updating the status.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col space-y-6">
        <div className="h-8 w-1/3 rounded bg-transparent"></div>
        <div className="h-64 w-full rounded-2xl bg-transparent"></div>
      </div>
    );
  }

  if (!application) {
    return (
      <Card>
        <CardContent className="pt-6">
          {error || "Not found"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <DecisionReviewDialog
        open={showConfirmModal.show}
        onOpenChange={(open) => {
          if (!open) setShowConfirmModal({ show: false, type: null });
        }}
        title={showConfirmModal.type === "EXECUTE" ? "Execute approved admission" : "Begin Department review"}
        description="Review the applicant and workflow effects before continuing."
        subjectLabel="Applicant"
        subject={`${application.applicantName} (${application.applicantEmail})`}
        decision={showConfirmModal.type === "EXECUTE" ? "Execute admission" : "Start Department review"}
        consequences={showConfirmModal.type === "EXECUTE" ? [
          "A Student account and registration will be created.",
          "Programme milestones will be scheduled from the registration date.",
          "The applicant will receive account setup and admission notification messages.",
        ] : [
          "The application status will change to under review.",
          "The Department review workflow will become active.",
          "The action will be retained in the lifecycle history.",
        ]}
        reversible={showConfirmModal.type !== "EXECUTE"}
        confirmLabel={showConfirmModal.type === "EXECUTE" ? "Execute admission" : "Begin review"}
        pendingLabel={showConfirmModal.type === "EXECUTE" ? "Executing..." : "Starting..."}
        isPending={isUpdating}
        onConfirm={() => void handleUpdateStatus()}
      />

      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Review Application</h2>
        <Button variant="outline" asChild>
          <Link href="/dashboard/admin/applications">
            &larr; Back to List
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl">{application.applicantName}</CardTitle>
              <CardDescription className="mt-2 text-base">
                {application.applicantEmail} • {application.applicantPhone || "No phone provided"}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="uppercase">
              {application.programType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Research Area</h3>
                <div className="rounded-md border bg-muted/50 p-4 text-base">
                  {application.researchArea || "Not specified"}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Proposal</h3>
                <div className="rounded-md border bg-muted/50 p-4 text-base">
                  <p className="font-medium">{application.proposalTitle}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {application.proposalAbstract}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Proposed supervisor consent: {application.supervisorConsentStatus}.
                </p>
                {application.supervisorConsentStatus === "CONSENTED" && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Label htmlFor="proposal-reviewer" className="sr-only">Proposal reviewer</Label>
                    <select
                      id="proposal-reviewer"
                      className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                      value={selectedReviewerId}
                      onChange={(event) => setSelectedReviewerId(event.target.value)}
                    >
                      <option value="">Select a proposal reviewer</option>
                      {reviewers.map((reviewer) => (
                        <option key={reviewer.id} value={reviewer.id}>
                          {reviewer.displayName} — {reviewer.role}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!selectedReviewerId || isUpdating}
                      onClick={() => void assignReviewer()}
                    >
                      Assign reviewer
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Statement of Purpose</h3>
                <div className="rounded-md border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {application.statementOfPurpose || "No statement provided."}
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supporting Documents</h3>
              <div className="flex-1 rounded-md border p-0">
                {application.documents.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground italic">No documents attached.</div>
                ) : (
                  <div className="divide-y">
                    {application.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-4 overflow-hidden">
                          <svg className="h-6 w-6 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="truncate font-medium text-sm" title={doc.fileName}>
                            {doc.fileName}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.id)}
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse justify-end gap-4 border-t pt-6 sm:flex-row">
          {application.status === "SUBMITTED" && (
            <Button
              onClick={() =>
                setShowConfirmModal({ show: true, type: "UNDER_REVIEW" })
              }
              disabled={isUpdating}
            >
              Begin Department Review
            </Button>
          )}
          {application.departmentDecision === "APPROVED" &&
            application.status !== "ADMITTED" && (
              <Button
                onClick={() =>
                  setShowConfirmModal({ show: true, type: "EXECUTE" })
                }
                disabled={isUpdating}
              >
                {isUpdating ? "Processing..." : "Execute Admission"}
              </Button>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
