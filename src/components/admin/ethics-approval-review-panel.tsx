"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EthicsDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  createdAt: string;
};

type EthicsApproval = {
  id: string;
  title: string;
  summary: string;
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

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EthicsApprovalReviewPanel() {
  const [approvals, setApprovals] = useState<EthicsApproval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await secureFetch("/api/admin/ethics", {
        credentials: "include",
      });
      const payload = (await response.json()) as EthicsApprovalsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load ethics documents.");
      }

      setApprovals(payload.approvals ?? []);
    } catch (caught) {
      setApprovals([]);
      setError(caught instanceof Error ? caught.message : "Unable to load ethics documents.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const documentCount = useMemo(
    () => approvals.reduce((total, approval) => total + approval.documents.length, 0),
    [approvals],
  );

  async function handleDownload(document: EthicsDocument) {
    setBusyId(`download-${document.id}`);
    setError(null);
    setMessage(null);

    try {
      const response = await secureFetch(`/api/documents/${document.id}`, {
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

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="mb-8 flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Ethics Documents</h2>
          <p className="mt-2 text-muted-foreground">
            View and download submitted ethics document packages. No decision workflow is required.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadApprovals()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submissions</CardDescription>
            <CardTitle>{approvals.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents</CardDescription>
            <CardTitle>{documentCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Workflow</CardDescription>
            <CardTitle className="text-lg">Document-only</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Loader />
                <span>Loading ethics documents...</span>
              </div>
            </CardContent>
          </Card>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-lg font-semibold">No ethics documents found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Student submissions will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          approvals.map((approval) => (
            <Card key={approval.id}>
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <Badge variant="secondary">Submitted</Badge>
                    <CardTitle>{approval.title}</CardTitle>
                    <CardDescription>
                      {approval.student.displayName} - {approval.student.email} -{" "}
                      {approval.student.programType}
                    </CardDescription>
                  </div>
                  <div className="text-sm text-muted-foreground lg:text-right">
                    <p>Submitted {formatDateLabel(approval.createdAt)}</p>
                    <p>Updated {formatDateLabel(approval.updatedAt)}</p>
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
