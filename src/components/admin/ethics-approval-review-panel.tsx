"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EthicsStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

type EthicsDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string;
};

type EthicsApproval = {
  id: string;
  title: string;
  summary: string;
  status: EthicsStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    displayName: string;
    email: string;
    programType: string;
  };
  documents: EthicsDocument[];
};

type EthicsApprovalsResponse = {
  approvals?: EthicsApproval[];
  error?: string;
};

type DownloadResponse = {
  downloadUrl?: string;
  error?: string;
};

const STATUS_OPTIONS: Array<{ value: EthicsStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Not reviewed";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusBadge(status: EthicsStatus) {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
      return "destructive";
    case "UNDER_REVIEW":
      return "secondary";
    case "SUBMITTED":
      return "outline";
  }
}

export function EthicsApprovalReviewPanel() {
  const [approvals, setApprovals] = useState<EthicsApproval[]>([]);
  const [statusFilter, setStatusFilter] = useState<EthicsStatus | "ALL">("ALL");
  const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      const response = await fetch(
        `/api/admin/ethics${params.size > 0 ? `?${params.toString()}` : ""}`,
        {
          credentials: "include",
        },
      );
      const payload = (await response.json()) as EthicsApprovalsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load ethics approvals.");
      }

      setApprovals(payload.approvals ?? []);
      setReviewNotesById((current) => {
        const next = { ...current };

        for (const approval of payload.approvals ?? []) {
          if (next[approval.id] === undefined) {
            next[approval.id] = approval.reviewNotes ?? "";
          }
        }

        return next;
      });
    } catch (caught) {
      setApprovals([]);
      setError(caught instanceof Error ? caught.message : "Unable to load ethics approvals.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const counts = useMemo(() => {
    return approvals.reduce(
      (acc, approval) => {
        acc.total += 1;
        acc[approval.status] += 1;
        return acc;
      },
      {
        total: 0,
        SUBMITTED: 0,
        UNDER_REVIEW: 0,
        APPROVED: 0,
        REJECTED: 0,
      } as Record<EthicsStatus | "total", number>,
    );
  }, [approvals]);

  async function handleDownload(document: EthicsDocument) {
    setBusyId(`download-${document.id}`);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as DownloadResponse;

      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Unable to prepare document download.");
      }

      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
      setMessage(`Secure download opened for ${document.fileName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open document.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecision(approvalId: string, status: EthicsStatus) {
    setBusyId(`${status}-${approvalId}`);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/ethics/${approvalId}/decision`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status,
          reviewNotes: reviewNotesById[approvalId] ?? "",
        }),
      });
      const payload = (await response.json()) as {
        approval?: EthicsApproval;
        error?: string;
      };

      if (!response.ok || !payload.approval) {
        throw new Error(payload.error ?? "Unable to update ethics approval.");
      }

      setMessage(`Ethics approval marked ${status.replaceAll("_", " ").toLowerCase()}.`);
      await loadApprovals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update ethics approval.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ethics Approvals</h2>
          <p className="text-muted-foreground mt-2">
            Review student ethics clearance submissions and record final decisions.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadApprovals()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total visible</CardDescription>
            <CardTitle>{counts.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submitted</CardDescription>
            <CardTitle>{counts.SUBMITTED}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Under review</CardDescription>
            <CardTitle>{counts.UNDER_REVIEW}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved</CardDescription>
            <CardTitle>{counts.APPROVED}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="max-w-xs space-y-2">
            <Label>Status filter</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as EthicsStatus | "ALL")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading ethics approval submissions...
            </CardContent>
          </Card>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg font-semibold">No ethics approvals found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                New student submissions will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          approvals.map((approval) => {
            const isTerminal =
              approval.status === "APPROVED" || approval.status === "REJECTED";

            return (
              <Card key={approval.id}>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <Badge variant={getStatusBadge(approval.status)} className="uppercase">
                        {approval.status.replaceAll("_", " ")}
                      </Badge>
                      <CardTitle>{approval.title}</CardTitle>
                      <CardDescription>
                        {approval.student.displayName} • {approval.student.email} •{" "}
                        {approval.student.programType}
                      </CardDescription>
                    </div>
                    <div className="text-sm text-muted-foreground lg:text-right">
                      <p>Submitted {formatDateLabel(approval.createdAt)}</p>
                      <p>
                        Reviewed {formatDateLabel(approval.reviewedAt)}
                        {approval.reviewedByName ? ` by ${approval.reviewedByName}` : ""}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-muted-foreground">{approval.summary}</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    {approval.documents.map((document) => (
                      <div
                        key={document.id}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{document.fileName}</p>
                          <p className="break-all text-xs text-muted-foreground">
                            {document.storagePath}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDownload(document)}
                          disabled={busyId === `download-${document.id}`}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label>Review notes</Label>
                    <Textarea
                      value={reviewNotesById[approval.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotesById((current) => ({
                          ...current,
                          [approval.id]: event.target.value,
                        }))
                      }
                      className="min-h-[100px]"
                      placeholder="Record ethics committee comments or rejection reasons..."
                      disabled={isTerminal}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      disabled={isTerminal || busyId === `UNDER_REVIEW-${approval.id}`}
                      onClick={() => void handleDecision(approval.id, "UNDER_REVIEW")}
                    >
                      {busyId === `UNDER_REVIEW-${approval.id}` ? "Updating..." : "Mark Under Review"}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={isTerminal || busyId === `REJECTED-${approval.id}`}
                      onClick={() => void handleDecision(approval.id, "REJECTED")}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      {busyId === `REJECTED-${approval.id}` ? "Rejecting..." : "Reject"}
                    </Button>
                    <Button
                      disabled={isTerminal || busyId === `APPROVED-${approval.id}`}
                      onClick={() => void handleDecision(approval.id, "APPROVED")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {busyId === `APPROVED-${approval.id}` ? "Approving..." : "Approve"}
                    </Button>
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
