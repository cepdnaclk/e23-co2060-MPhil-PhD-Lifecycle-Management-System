"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

type StaffRole = "supervisor" | "admin" | "hod";

type EthicsRecord = {
  id: string;
  title: string;
  summary: string;
  applicability: "UNDETERMINED" | "REQUIRED" | "NOT_REQUIRED";
  status:
    | "NOT_RECORDED"
    | "PENDING"
    | "APPROVED"
    | "EXEMPT"
    | "REJECTED"
    | "EXPIRED";
  workflowStage:
    | "STUDENT_DECLARATION"
    | "SUPERVISOR_RECOMMENDATION"
    | "COORDINATOR_RECORD"
    | "HOD_CONFIRMATION"
    | "COMPLETED";
  revisionNumber: number;
  coordinatorProposedStatus:
    | "NOT_RECORDED"
    | "PENDING"
    | "APPROVED"
    | "EXEMPT"
    | "REJECTED"
    | "EXPIRED"
    | null;
  referenceNumber: string | null;
  student: {
    id: string;
    displayName: string;
    email: string;
    programType: string;
  };
  documents: Array<{
    id: string;
    fileName: string;
  }>;
  decisionHistory: Array<{
    id: string;
    action: string;
    notes: string | null;
    actor: {
      displayName: string;
    };
  }>;
};

const roleConfig = {
  supervisor: {
    title: "Ethics Recommendations",
    description:
      "Review declarations for assigned Students and recommend or return them.",
    listUrl: "/api/supervisor/ethics",
    activeStage: "SUPERVISOR_RECOMMENDATION",
  },
  admin: {
    title: "PG Coordinator Ethics Records",
    description:
      "Record the Department status after the Supervisor recommendation.",
    listUrl: "/api/admin/ethics",
    activeStage: "COORDINATOR_RECORD",
  },
  hod: {
    title: "HOD Ethics Confirmations",
    description:
      "Confirm, return, or reject the status recorded by the PG Coordinator.",
    listUrl: "/api/hod/ethics",
    activeStage: "HOD_CONFIRMATION",
  },
} as const;

export function EthicsWorkflowPanel({ role }: { role: StaffRole }) {
  const config = roleConfig[role];
  const [records, setRecords] = useState<EthicsRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<
    Record<string, "APPROVED" | "EXEMPT" | "REJECTED">
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await secureFetch(config.listUrl, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        approvals?: EthicsRecord[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load the ethics queue.");
      }
      setRecords(payload.approvals ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the ethics queue.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [config.listUrl]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function submitAction(
    record: EthicsRecord,
    action:
      | "RECOMMEND"
      | "RETURN"
      | "RECORD"
      | "CONFIRM"
      | "REJECT",
  ) {
    setBusyId(record.id);
    setError(null);
    setMessage(null);
    try {
      const actionUrl =
        role === "supervisor"
          ? `/api/supervisor/ethics/${record.id}/recommendation`
          : role === "admin"
            ? `/api/admin/ethics/${record.id}/record`
            : `/api/hod/ethics/${record.id}/confirmation`;
      const status =
        record.applicability === "NOT_REQUIRED"
          ? "EXEMPT"
          : (statuses[record.id] ?? "APPROVED");
      const response = await secureFetch(actionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: action,
          notes: notes[record.id],
          ...(role === "admin" && action === "RECORD"
            ? {
                status,
                referenceNumber:
                  status === "APPROVED" ? references[record.id] : undefined,
              }
            : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to record the ethics action.");
      }
      setMessage("Ethics workflow action recorded.");
      await loadRecords();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to record the ethics action.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openDocument(documentId: string) {
    setBusyId(`document-${documentId}`);
    setError(null);
    try {
      const response = await secureFetch(`/api/documents/${documentId}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        downloadUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Unable to open the document.");
      }
      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to open the document.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 space-y-5 p-4 pt-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{config.title}</h2>
          <p className="mt-2 text-muted-foreground">{config.description}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadRecords()}
          disabled={isLoading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {message}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
            <Loader />
            Loading ethics records...
          </CardContent>
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No ethics records are available.
          </CardContent>
        </Card>
      ) : (
        records.map((record) => {
          const isActionable = record.workflowStage === config.activeStage;
          const selectedStatus =
            record.applicability === "NOT_REQUIRED"
              ? "EXEMPT"
              : (statuses[record.id] ?? "APPROVED");
          return (
            <Card key={record.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Badge variant={isActionable ? "default" : "secondary"}>
                      {record.workflowStage.replaceAll("_", " ")}
                    </Badge>
                    <CardTitle className="mt-3">{record.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {record.student.displayName} · {record.student.email} ·{" "}
                      {record.student.programType}
                    </CardDescription>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Revision {record.revisionNumber}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">{record.summary}</p>
                <p className="text-sm">
                  <strong>Applicability:</strong>{" "}
                  {record.applicability.replaceAll("_", " ")} ·{" "}
                  <strong>Status:</strong> {record.status.replaceAll("_", " ")}
                </p>

                {record.documents.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {record.documents.map((document) => (
                      <Button
                        key={document.id}
                        variant="outline"
                        size="sm"
                        onClick={() => void openDocument(document.id)}
                        disabled={busyId === `document-${document.id}`}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {document.fileName}
                      </Button>
                    ))}
                  </div>
                )}

                {record.decisionHistory.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-semibold">Decision history</p>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      {record.decisionHistory.map((decision) => (
                        <li key={decision.id}>
                          {decision.action.replaceAll("_", " ")} by{" "}
                          {decision.actor.displayName}
                          {decision.notes ? ` — ${decision.notes}` : ""}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {isActionable && (
                  <div className="space-y-3 rounded-md border p-4">
                    {role === "admin" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`status-${record.id}`}>
                            Department status
                          </Label>
                          <select
                            id={`status-${record.id}`}
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={selectedStatus}
                            disabled={record.applicability === "NOT_REQUIRED"}
                            onChange={(event) =>
                              setStatuses((current) => ({
                                ...current,
                                [record.id]: event.target.value as
                                  | "APPROVED"
                                  | "EXEMPT"
                                  | "REJECTED",
                              }))
                            }
                          >
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                            <option value="EXEMPT">Exempt</option>
                          </select>
                        </div>
                        {selectedStatus === "APPROVED" && (
                          <div className="space-y-2">
                            <Label htmlFor={`reference-${record.id}`}>
                              Approval reference
                            </Label>
                            <Input
                              id={`reference-${record.id}`}
                              value={references[record.id] ?? ""}
                              onChange={(event) =>
                                setReferences((current) => ({
                                  ...current,
                                  [record.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor={`notes-${record.id}`}>Decision notes</Label>
                      <Textarea
                        id={`notes-${record.id}`}
                        value={notes[record.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [record.id]: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {role === "supervisor" && (
                        <>
                          <Button
                            onClick={() =>
                              void submitAction(record, "RECOMMEND")
                            }
                            disabled={busyId === record.id}
                          >
                            Recommend
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void submitAction(record, "RETURN")}
                            disabled={busyId === record.id}
                          >
                            Return to Student
                          </Button>
                        </>
                      )}
                      {role === "admin" && (
                        <>
                          <Button
                            onClick={() => void submitAction(record, "RECORD")}
                            disabled={
                              busyId === record.id ||
                              (selectedStatus === "APPROVED" &&
                                !references[record.id]?.trim())
                            }
                          >
                            Record for HOD
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void submitAction(record, "RETURN")}
                            disabled={busyId === record.id}
                          >
                            Return
                          </Button>
                        </>
                      )}
                      {role === "hod" && (
                        <>
                          <Button
                            onClick={() => void submitAction(record, "CONFIRM")}
                            disabled={busyId === record.id}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void submitAction(record, "RETURN")}
                            disabled={busyId === record.id}
                          >
                            Return to Coordinator
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => void submitAction(record, "REJECT")}
                            disabled={busyId === record.id}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
