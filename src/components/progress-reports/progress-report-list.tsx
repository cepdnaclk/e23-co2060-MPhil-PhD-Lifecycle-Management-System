"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import useSWR from "swr";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { progressReportDocumentSchema } from "@/lib/progress-reports/schemas";
import { secureFetch } from "@/lib/security/client-request";

type MilestoneStatus =
  | "SCHEDULED"
  | "DUE"
  | "SUBMITTED"
  | "RETURNED"
  | "APPROVED"
  | "OVERDUE"
  | "WAIVED";

type Milestone = {
  id: string;
  sequenceNumber: number;
  dueDate: string;
  status: MilestoneStatus;
  completedAt: string | null;
  progressReport: {
    id: string;
    status: "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
    currentVersion: number;
    submittedAt: string | null;
    returnReason: string | null;
    approvedAt: string | null;
    versions: Array<{
      id: string;
      versionNumber: number;
      narrative: string;
      changeSummary: string | null;
      submittedAt: string;
      documents: Array<{
        id: string;
        fileName: string;
        mimeType: string;
      }>;
    }>;
  } | null;
};

type MilestonePayload = {
  studentId: string;
  isActive: boolean;
  milestones: Milestone[];
};

async function fetchMilestones(url: string) {
  const response = await secureFetch(url);
  const payload = (await response.json()) as MilestonePayload & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load fixed milestones.");
  }
  return payload;
}

export function ProgressReportList() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/student/progress-reports",
    fetchMilestones,
  );
  const [narrative, setNarrative] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const nextMilestone = data?.milestones.find(
    (milestone) =>
      milestone.status !== "APPROVED" && milestone.status !== "WAIVED",
  );
  const canSubmit =
    data?.isActive &&
    nextMilestone &&
    ["SCHEDULED", "DUE", "OVERDUE", "RETURNED"].includes(
      nextMilestone.status,
    );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const invalid = selected.find(
      (file) =>
        !progressReportDocumentSchema.safeParse({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }).success,
    );
    if (invalid) {
      setMessage(`${invalid.name} is not an accepted PDF or ZIP document.`);
      setFiles([]);
      event.target.value = "";
      return;
    }
    setMessage(null);
    setFiles(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nextMilestone || narrative.trim().length < 20) {
      setMessage("Enter at least 20 characters of progress narrative.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    let uploadSessionId: string | undefined;
    try {
      if (files.length > 0) {
        const prepared = await secureFetch(
          "/api/student/progress-reports/upload-url",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              files: files.map((file) => ({
                fileName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
              })),
            }),
          },
        );
        const preparation = (await prepared.json()) as {
          error?: string;
          uploadSessionId?: string;
          uploads?: Array<{ signedUrl: string | null }>;
        };
        if (
          !prepared.ok ||
          !preparation.uploadSessionId ||
          preparation.uploads?.length !== files.length
        ) {
          throw new Error(
            preparation.error ?? "Unable to prepare progress evidence.",
          );
        }
        uploadSessionId = preparation.uploadSessionId;
        for (const [index, file] of files.entries()) {
          const signedUrl = preparation.uploads[index]?.signedUrl;
          if (!signedUrl) throw new Error("An upload target was not available.");
          const uploaded = await secureFetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!uploaded.ok) {
            throw new Error(`Unable to upload ${file.name}.`);
          }
        }
      }

      const response = await secureFetch(
        `/api/progress/milestones/${nextMilestone.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            narrative,
            changeSummary:
              nextMilestone.status === "RETURNED"
                ? changeSummary
                : undefined,
            uploadSessionId,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit milestone progress.");
      }

      setNarrative("");
      setChangeSummary("");
      setFiles([]);
      setMessage(`Milestone M${nextMilestone.sequenceNumber} submitted.`);
      await mutate();
    } catch (caught) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to submit milestone progress.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-md border bg-muted" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
        {error instanceof Error ? error.message : "Unable to load milestones."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.milestones.map((milestone) => (
          <Card key={milestone.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Milestone M{milestone.sequenceNumber}</CardTitle>
                  <CardDescription>
                    Due{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(milestone.dueDate))}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    milestone.status === "APPROVED"
                      ? "default"
                      : milestone.status === "OVERDUE"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {milestone.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {milestone.progressReport?.returnReason && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Supervisor return reason: {milestone.progressReport.returnReason}
                </p>
              )}
              {milestone.progressReport?.versions.map((version) => (
                <div key={version.id} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    Version {version.versionNumber} ·{" "}
                    {new Date(version.submittedAt).toLocaleDateString("en-GB")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {version.narrative}
                  </p>
                  {version.changeSummary && (
                    <p className="text-sm">
                      Revision summary: {version.changeSummary}
                    </p>
                  )}
                  {version.documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate text-sm">{document.fileName}</span>
                      <SubmissionDocumentDownloadButton
                        documentId={document.id}
                        fileName={document.fileName}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {!milestone.progressReport && (
                <p className="text-sm text-muted-foreground">
                  No version submitted.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {canSubmit && nextMilestone && (
        <Card>
          <CardHeader>
            <CardTitle>
              {nextMilestone.status === "RETURNED" ? "Resubmit" : "Submit"} M
              {nextMilestone.sequenceNumber}
            </CardTitle>
            <CardDescription>
              The fixed milestone label and due date are controlled by the
              programme schedule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <label htmlFor="milestone-narrative" className="text-sm font-medium">
                  Progress narrative
                </label>
                <Textarea
                  id="milestone-narrative"
                  rows={8}
                  minLength={20}
                  maxLength={20_000}
                  required
                  value={narrative}
                  onChange={(event) => setNarrative(event.target.value)}
                />
              </div>
              {nextMilestone.status === "RETURNED" && (
                <div className="space-y-2">
                  <label htmlFor="change-summary" className="text-sm font-medium">
                    What changed
                  </label>
                  <Textarea
                    id="change-summary"
                    maxLength={2_000}
                    required
                    value={changeSummary}
                    onChange={(event) => setChangeSummary(event.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="progress-evidence" className="text-sm font-medium">
                  Supporting evidence (optional PDF or ZIP)
                </label>
                <Input
                  id="progress-evidence"
                  type="file"
                  multiple
                  accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                  onChange={handleFileChange}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  narrative.trim().length < 20 ||
                  (nextMilestone.status === "RETURNED" &&
                    !changeSummary.trim())
                }
              >
                {isSubmitting ? "Submitting…" : "Submit milestone version"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!data.isActive && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          An active Student record and fixed-term registration are required
          before progress can be submitted.
        </p>
      )}
    </div>
  );
}
