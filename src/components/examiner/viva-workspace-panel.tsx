"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

type ExaminerViva = {
  id: string;
  scheduledDate: string | Date;
  venue: string;
  outcome: string | null;
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

export function VivaWorkspacePanel({ vivas }: { vivas: ExaminerViva[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingThesisId, setDownloadingThesisId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outcomes = ["PASS", "MINOR_CORRECTIONS", "MAJOR_CORRECTIONS", "FAIL"] as const;
  const outcomeLabels: Record<string, string> = {
    PASS: "Pass",
    MINOR_CORRECTIONS: "Minor Corrections",
    MAJOR_CORRECTIONS: "Major Corrections",
    FAIL: "Fail",
  };

  async function recordOutcome(vivaId: string) {
    const outcome = selectedOutcome[vivaId];
    if (!outcome) {
      setError("Select an outcome before recording the viva result.");
      return;
    }
    setBusyId(vivaId);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/vivas/${vivaId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outcome }),
      });
      const payload = (await response.json()) as {
        error?: string;
        requiresAdministrativeApproval?: boolean;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to record viva outcome.");
      setMessage(
        payload.requiresAdministrativeApproval
          ? "Viva outcome recorded. Final archive is waiting for administrator approval."
          : "Viva outcome recorded successfully.",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record viva outcome.");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadThesis(thesisId: string) {
    setDownloadingThesisId(thesisId);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/theses/${thesisId}/download`, {
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
            Review thesis documents and record final examination outcomes.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <p>{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          <p>{message}</p>
        </div>
      )}

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
            const isRecorded = Boolean(viva.outcome);

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
                        {viva.outcome?.replaceAll("_", " ")}
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
                          <Label>Final Outcome</Label>
                          <Select
                            value={selectedOutcome[viva.id] ?? ""}
                            onValueChange={(val) => setSelectedOutcome(c => ({...c, [viva.id]: val}))}
                            disabled={!canRecord}
                          >
                            <SelectTrigger>
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
                        <Button
                          disabled={!canRecord || busyId === viva.id || !selectedOutcome[viva.id]}
                          onClick={() => void recordOutcome(viva.id)}
                        >
                          {busyId === viva.id ? "Recording..." : "Record Outcome"}
                        </Button>
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
