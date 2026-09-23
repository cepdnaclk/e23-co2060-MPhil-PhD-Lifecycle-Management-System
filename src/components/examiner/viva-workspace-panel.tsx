"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ExaminerViva = {
  id: string;
  scheduledDate: string | Date;
  venue: string;
  outcome: string | null;
  recommendation: string | null;
  assignment: {
    id: string;
    reportSubmitted: boolean;
    reportDocument: { id: string; fileName: string } | null;
  };
  thesis: {
    id: string;
    title: string;
    abstract: string;
    status: string;
    student: {
      user: {
        displayName: string;
        email: string;
      };
    };
  };
};

type ThesisDownloadResponse = {
  error?: string;
  downloadUrl?: string;
  document?: {
    fileName: string;
  };
};

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DecisionReviewDialog } from "@/components/ui/decision-review-dialog";
import { WorkflowFeedback } from "@/components/ui/workflow-feedback";

export function VivaWorkspacePanel({ vivas }: { vivas: ExaminerViva[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingThesisId, setDownloadingThesisId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, string>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [reportOutcomes, setReportOutcomes] = useState<Record<string, string>>({});
  const [reportTexts, setReportTexts] = useState<Record<string, string>>({});
  const [reportFiles, setReportFiles] = useState<Record<string, File | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingRecommendation, setPendingRecommendation] = useState<ExaminerViva | null>(null);

  const outcomes = ["PASS", "MINOR_CORRECTIONS", "MAJOR_CORRECTIONS", "FAIL"] as const;
  const outcomeLabels: Record<string, string> = {
    PASS: "Pass",
    MINOR_CORRECTIONS: "Minor Corrections",
    MAJOR_CORRECTIONS: "Major Corrections",
    FAIL: "Fail",
  };

  async function uploadReportPdf(viva: ExaminerViva, reportFile: File) {
    let uploadSessionId: string | null = null;
    try {
      const uploadUrlResponse = await secureFetch(
        `/api/examiner-assignments/${viva.assignment.id}/report/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            files: [
              {
                fileName: reportFile.name,
                mimeType: reportFile.type,
                sizeBytes: reportFile.size,
              },
            ],
          }),
        },
      );
      const uploadPayload = (await uploadUrlResponse.json()) as {
        error?: string;
        uploadSessionId?: string;
        uploads?: Array<{ signedUrl: string | null }>;
      };
      const signedUrl = uploadPayload.uploads?.[0]?.signedUrl;
      if (!uploadUrlResponse.ok || !uploadPayload.uploadSessionId || !signedUrl) {
        throw new Error(
          uploadPayload.error ?? "Unable to prepare the examiner report upload.",
        );
      }
      uploadSessionId = uploadPayload.uploadSessionId;
      const uploadResponse = await secureFetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": reportFile.type },
        body: reportFile,
      });
      if (!uploadResponse.ok) {
        throw new Error("The examiner report PDF upload failed.");
      }
      return uploadSessionId;
    } catch (error) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      throw error;
    }
  }

  async function submitIndependentReport(viva: ExaminerViva) {
    const recommendation = reportOutcomes[viva.id];
    const reportText = reportTexts[viva.id]?.trim() ?? "";
    const reportFile = reportFiles[viva.id];
    if (!recommendation || reportText.length < 20) {
      setError("Select a report recommendation and provide a report of at least 20 characters.");
      return;
    }
    if (
      !reportFile ||
      reportFile.type !== "application/pdf" ||
      !reportFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Select one PDF examiner report before submitting.");
      return;
    }
    if (!viva.assignment.id) {
      setError("No confirmed examiner assignment was found for this viva.");
      return;
    }

    setBusyId(viva.id);
    setMessage(null);
    setError(null);
    let uploadSessionId: string | null = null;

    try {
      uploadSessionId = await uploadReportPdf(viva, reportFile);

      const response = await secureFetch(
        `/api/examiner-assignments/${viva.assignment.id}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recommendation, reportText, uploadSessionId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit the independent thesis report.");
      }
      setMessage("Independent thesis report submitted. You may now submit the viva recommendation.");
      setCompletedAt(new Date());
      setReportFiles((current) => ({ ...current, [viva.id]: null }));
      router.refresh();
    } catch (caught) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to submit the independent thesis report.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function attachPdfToExistingReport(viva: ExaminerViva) {
    const reportFile = reportFiles[viva.id];
    if (
      !reportFile ||
      reportFile.type !== "application/pdf" ||
      !reportFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Select one PDF examiner report before attaching.");
      return;
    }
    setBusyId(viva.id);
    setMessage(null);
    setError(null);
    let uploadSessionId: string | null = null;
    try {
      uploadSessionId = await uploadReportPdf(viva, reportFile);
      const response = await secureFetch(
        `/api/examiner-assignments/${viva.assignment.id}/report/attachment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ uploadSessionId }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to attach the examiner report PDF.");
      }
      setMessage("Formal examiner report PDF attached successfully.");
      setCompletedAt(new Date());
      setReportFiles((current) => ({ ...current, [viva.id]: null }));
      router.refresh();
    } catch (caught) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to attach the examiner report PDF.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function recordRecommendation(vivaId: string) {
    const recommendation = selectedOutcome[vivaId];
    const rationale = rationales[vivaId]?.trim() ?? "";
    if (!recommendation || rationale.length < 20) {
      setError("Select a recommendation and provide a rationale of at least 20 characters.");
      return;
    }
    setBusyId(vivaId);
    setMessage(null);
    setError(null);

    try {
      const response = await secureFetch(`/api/vivas/${vivaId}/recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recommendation, rationale }),
      });
      const payload = (await response.json()) as {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit viva recommendation.");
      setMessage("Independent viva recommendation submitted to the Head of Department.");
      setCompletedAt(new Date());
      setPendingRecommendation(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit viva recommendation.");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadThesis(thesisId: string) {
    setDownloadingThesisId(thesisId);
    setMessage(null);
    setError(null);

    try {
      const response = await secureFetch(`/api/theses/${thesisId}/download`, {
        credentials: "include",
      });
      const payload = (await response.json()) as ThesisDownloadResponse;

      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Unable to prepare the thesis download.");
      }

      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
      setMessage(
        payload.document?.fileName
          ? `Secure download opened for ${payload.document.fileName}.`
          : "Secure thesis download opened.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open thesis download.");
    } finally {
      setDownloadingThesisId(null);
    }
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Assigned Vivas</h2>
          <p className="text-muted-foreground mt-2">
            Review the thesis, submit the independent report, then record your viva recommendation.
          </p>
        </div>
      </div>

      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />

      <DecisionReviewDialog
        open={Boolean(pendingRecommendation)}
        onOpenChange={(open) => {
          if (!open) setPendingRecommendation(null);
        }}
        title="Submit viva recommendation"
        description="Your independent recommendation becomes part of the examination record."
        subjectLabel="Candidate and thesis"
        subject={pendingRecommendation ? `${pendingRecommendation.thesis.student.user.displayName} — ${pendingRecommendation.thesis.title}` : ""}
        decision={pendingRecommendation ? outcomeLabels[selectedOutcome[pendingRecommendation.id] ?? ""] ?? "" : ""}
        rationale={pendingRecommendation ? rationales[pendingRecommendation.id] : null}
        consequences={[
          "The Head of Department will receive this recommendation for the final outcome decision.",
          "The recommendation and rationale will be retained in the lifecycle audit record.",
          "The final HOD outcome is recorded separately after all required recommendations are available.",
        ]}
        reversible={false}
        confirmLabel="Submit recommendation"
        pendingLabel="Submitting..."
        isPending={Boolean(pendingRecommendation && busyId === pendingRecommendation.id)}
        onConfirm={() => {
          if (pendingRecommendation) void recordRecommendation(pendingRecommendation.id);
        }}
      />

      <div className="grid gap-6">
        {vivas.length === 0 ? (
          <div className="rounded-md border border-dashed p-12 text-center">
            <p className="text-lg font-bold">No assigned vivas</p>
            <p className="text-sm text-muted-foreground mt-2">
              Scheduled vivas will appear here.
            </p>
          </div>
        ) : (
          vivas.map((viva) => {
            const canRecord = viva.thesis.status === "UNDER_EXAMINATION";
            const isRecorded = Boolean(viva.recommendation);
            const reportSubmitted = viva.assignment.reportSubmitted;

            return (
              <Card key={viva.id}>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline">
                          {new Date(viva.scheduledDate).toLocaleDateString()}
                        </Badge>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {viva.venue}
                        </span>
                      </div>
                      <CardTitle>{viva.thesis.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Candidate: {viva.thesis.student.user.displayName}
                      </CardDescription>
                    </div>
                    {isRecorded ? (
                      <Badge variant="default" className="w-fit">
                        {viva.recommendation?.replaceAll("_", " ")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="w-fit">
                        Examination Pending
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border p-4 bg-muted/50 mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Thesis Abstract
                    </p>
                    <p className="text-sm text-foreground">
                      {viva.thesis.abstract}
                    </p>
                  </div>

                  <div className="rounded-md border p-4 mb-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Independent thesis report</p>
                        <p className="text-sm text-muted-foreground">
                          This report must be submitted before the viva recommendation.
                        </p>
                      </div>
                      <Badge variant={reportSubmitted ? "default" : "secondary"}>
                        {reportSubmitted ? "Submitted" : "Required"}
                      </Badge>
                    </div>

                    {!reportSubmitted && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`report-recommendation-${viva.id}`}>
                            Report recommendation
                          </Label>
                          <Select
                            value={reportOutcomes[viva.id] ?? ""}
                            onValueChange={(value) =>
                              setReportOutcomes((current) => ({
                                ...current,
                                [viva.id]: value,
                              }))
                            }
                            disabled={!canRecord}
                          >
                            <SelectTrigger id={`report-recommendation-${viva.id}`}>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {outcomes.map((outcome) => (
                                <SelectItem key={outcome} value={outcome}>
                                  {outcomeLabels[outcome]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`report-text-${viva.id}`}>Report</Label>
                          <Textarea
                            id={`report-text-${viva.id}`}
                            value={reportTexts[viva.id] ?? ""}
                            onChange={(event) =>
                              setReportTexts((current) => ({
                                ...current,
                                [viva.id]: event.target.value,
                              }))
                            }
                            disabled={!canRecord}
                            placeholder="Enter the independent thesis examination report (at least 20 characters)."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`report-pdf-${viva.id}`}>Formal report PDF</Label>
                          <Input
                            id={`report-pdf-${viva.id}`}
                            type="file"
                            accept="application/pdf,.pdf"
                            disabled={!canRecord}
                            onChange={(event) =>
                              setReportFiles((current) => ({
                                ...current,
                                [viva.id]: event.target.files?.[0] ?? null,
                              }))
                            }
                          />
                        </div>
                        <Button
                          className="md:col-span-2 md:justify-self-end"
                          disabled={
                            !canRecord ||
                            busyId === viva.id ||
                            !reportOutcomes[viva.id] ||
                            !reportFiles[viva.id] ||
                            (reportTexts[viva.id]?.trim().length ?? 0) < 20
                          }
                          onClick={() => void submitIndependentReport(viva)}
                        >
                          {busyId === viva.id ? "Submitting..." : "Submit Report"}
                        </Button>
                      </div>
                    )}
                    {reportSubmitted && !viva.assignment.reportDocument && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor={`legacy-report-pdf-${viva.id}`}>
                            Attach formal report PDF
                          </Label>
                          <Input
                            id={`legacy-report-pdf-${viva.id}`}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(event) =>
                              setReportFiles((current) => ({
                                ...current,
                                [viva.id]: event.target.files?.[0] ?? null,
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          disabled={busyId === viva.id || !reportFiles[viva.id]}
                          onClick={() => void attachPdfToExistingReport(viva)}
                        >
                          {busyId === viva.id ? "Attaching..." : "Attach PDF"}
                        </Button>
                      </div>
                    )}
                    {viva.assignment.reportDocument && (
                      <p className="text-sm text-muted-foreground">
                        Attached PDF: {viva.assignment.reportDocument.fileName}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <Button
                      variant="outline"
                      onClick={() => void downloadThesis(viva.thesis.id)}
                      disabled={downloadingThesisId === viva.thesis.id}
                    >
                      {downloadingThesisId === viva.thesis.id
                        ? "Opening..."
                        : "Download Thesis"}
                    </Button>

                    {!isRecorded && (
                      <div className="flex flex-col sm:flex-row items-end gap-4 flex-1">
                        <div className="w-full sm:max-w-xs space-y-1.5 ml-auto">
                          <Label htmlFor={`recommendation-${viva.id}`}>Recommendation</Label>
                          <Select
                            value={selectedOutcome[viva.id] ?? ""}
                            onValueChange={(val) => setSelectedOutcome(c => ({...c, [viva.id]: val}))}
                            disabled={!canRecord || !reportSubmitted}
                          >
                            <SelectTrigger id={`recommendation-${viva.id}`} aria-describedby={!canRecord ? `recommendation-help-${viva.id}` : undefined}>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {outcomes.map(outcome => (
                                <SelectItem key={outcome} value={outcome}>
                                  {outcomeLabels[outcome]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-full space-y-1.5">
                          <Label htmlFor={`rationale-${viva.id}`}>Rationale</Label>
                          <Textarea
                            id={`rationale-${viva.id}`}
                            aria-describedby={!canRecord ? `recommendation-help-${viva.id}` : `rationale-help-${viva.id}`}
                            value={rationales[viva.id] ?? ""}
                            onChange={(event) =>
                              setRationales((current) => ({
                                ...current,
                                [viva.id]: event.target.value,
                              }))
                            }
                            disabled={!canRecord || !reportSubmitted}
                            placeholder="Explain the basis for your recommendation."
                          />
                          <p id={`rationale-help-${viva.id}`} className="text-xs text-muted-foreground">Use at least 20 characters and explain the academic basis.</p>
                        </div>
                        <Button
                          disabled={
                            !canRecord ||
                            !reportSubmitted ||
                            busyId === viva.id ||
                            !selectedOutcome[viva.id] ||
                            (rationales[viva.id]?.trim().length ?? 0) < 20
                          }
                          aria-describedby={!canRecord ? `recommendation-help-${viva.id}` : undefined}
                          onClick={() => setPendingRecommendation(viva)}
                        >
                          {busyId === viva.id ? "Submitting..." : "Submit Recommendation"}
                        </Button>
                        {!canRecord ? <p id={`recommendation-help-${viva.id}`} className="sr-only">A recommendation is available only while the thesis is under examination.</p> : null}
                        {canRecord && !reportSubmitted ? (
                          <p className="text-xs text-muted-foreground">
                            Submit the independent thesis report above to unlock this action.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
