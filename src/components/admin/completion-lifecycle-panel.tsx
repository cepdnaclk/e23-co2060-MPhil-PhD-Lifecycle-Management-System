"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Label } from "@/components/ui/label";
import { DecisionReviewDialog } from "@/components/ui/decision-review-dialog";
import { WorkflowFeedback } from "@/components/ui/workflow-feedback";
import { secureFetch } from "@/lib/security/client-request";

type CompletionLifecycleItem = {
  id: string;
  studentName: string;
  email: string;
  programmeLabel: string;
  thesisTitle: string;
  completion: {
    status: string;
    hodApprovedAt: string | null;
    hodComments: string | null;
    completedAt: string | null;
  };
  graduation: {
    status: string;
    graduationDate: string | null;
    confirmationReference: string;
  } | null;
  archive: {
    status: string;
    archivedAt: string | null;
    reason: string | null;
  } | null;
};

async function postCommand(path: string, body?: unknown) {
  const response = await secureFetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "The lifecycle command failed.");
  }
}

export function CompletionLifecyclePanel({
  students,
}: {
  students: CompletionLifecycleItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    student: CompletionLifecycleItem;
    action: "completion" | "graduation" | "archive";
    body?: unknown;
    rationale?: string;
  } | null>(null);
  const [graduationDates, setGraduationDates] = useState<
    Record<string, string>
  >({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [graduationNotes, setGraduationNotes] = useState<
    Record<string, string>
  >({});
  const [archiveReasons, setArchiveReasons] = useState<
    Record<string, string>
  >({});

  async function act(
    studentId: string,
    action: "completion" | "graduation" | "archive",
    body?: unknown,
  ) {
    setBusy(`${studentId}:${action}`);
    setError(null);
    setMessage(null);
    try {
      await postCommand(`/api/admin/students/${studentId}/${action}`, body);
      setMessage(
        action === "completion"
          ? "Programme completion recorded."
          : action === "graduation"
            ? "Confirmed graduation recorded."
            : "Student lifecycle record archived.",
      );
      setCompletedAt(new Date());
      setPendingAction(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Lifecycle command failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />
      <DecisionReviewDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={pendingAction?.action === "archive" ? "Archive lifecycle record" : pendingAction?.action === "graduation" ? "Record confirmed graduation" : "Record programme completion"}
        description="Review the Student record and downstream lifecycle changes before continuing."
        subjectLabel="Student"
        subject={pendingAction ? `${pendingAction.student.studentName} — ${pendingAction.student.programmeLabel}` : ""}
        decision={pendingAction?.action === "archive" ? "Archive completed lifecycle" : pendingAction?.action === "graduation" ? "Record confirmed graduation" : "Execute programme completion"}
        rationale={pendingAction?.rationale}
        consequences={pendingAction?.action === "archive" ? [
          "The Student, registration, thesis, and related operational records become read-only.",
          "Documents and audit history are retained.",
          "The active account is not deactivated by this action.",
        ] : pendingAction?.action === "graduation" ? [
          "The external confirmation reference and graduation date become part of the official record.",
          "Lifecycle archiving becomes available next.",
          "The action is retained in the audit history.",
        ] : [
          "The thesis, Student profile, and registration are completed atomically.",
          "A lifecycle audit event and notification intent are recorded.",
          "Graduation still requires separate external confirmation.",
        ]}
        reversible={false}
        destructive={pendingAction?.action === "archive"}
        confirmLabel={pendingAction?.action === "archive" ? "Archive lifecycle" : pendingAction?.action === "graduation" ? "Record graduation" : "Record completion"}
        isPending={Boolean(pendingAction && busy === `${pendingAction.student.id}:${pendingAction.action}`)}
        onConfirm={() => {
          if (pendingAction) void act(pendingAction.student.id, pendingAction.action, pendingAction.body);
        }}
      />

      {students.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No HOD-approved or completed Student records are available.
          </CardContent>
        </Card>
      ) : (
        students.map((student) => {
          const completionRecorded = student.completion.status === "COMPLETED";
          const graduated = student.graduation?.status === "GRADUATED";
          const archived = student.archive?.status === "ARCHIVED";
          const graduationDate = graduationDates[student.id] ?? "";
          const confirmationReference = references[student.id] ?? "";
          const archiveReason = archiveReasons[student.id] ?? "";

          return (
            <Card key={student.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{student.studentName}</CardTitle>
                    <CardDescription>
                      {student.email} · {student.programmeLabel}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{student.completion.status.replaceAll("_", " ")}</Badge>
                    {graduated && <Badge variant="secondary">GRADUATED</Badge>}
                    {archived && <Badge variant="outline">ARCHIVED</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="font-medium">{student.thesisTitle}</p>
                  {student.completion.hodComments && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      HOD reason: {student.completion.hodComments}
                    </p>
                  )}
                </div>

                {!completionRecorded && (
                  <section className="space-y-2 rounded-md border p-4">
                    <h3 className="font-semibold">
                      1. Execute programme completion
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Atomically completes the thesis, Student, registration,
                      audit event, and notification intent.
                    </p>
                    <Button
                      disabled={busy === `${student.id}:completion`}
                      onClick={() => setPendingAction({ student, action: "completion" })}
                    >
                      {busy === `${student.id}:completion`
                        ? "Recording..."
                        : "Record completion"}
                    </Button>
                  </section>
                )}

                {completionRecorded && !graduated && (
                  <section className="space-y-3 rounded-md border p-4">
                    <h3 className="font-semibold">
                      2. Record confirmed graduation
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Use only after the Department receives external
                      confirmation.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1 text-sm">
                        <Label htmlFor={`graduation-date-${student.id}`}>Graduation date</Label>
                        <Input
                          id={`graduation-date-${student.id}`}
                          type="date"
                          value={graduationDate}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) =>
                            setGraduationDates((current) => ({
                              ...current,
                              [student.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1 text-sm">
                        <Label htmlFor={`graduation-reference-${student.id}`}>External confirmation reference</Label>
                        <Input
                          id={`graduation-reference-${student.id}`}
                          value={confirmationReference}
                          onChange={(event) =>
                            setReferences((current) => ({
                              ...current,
                              [student.id]: event.target.value,
                            }))
                          }
                          placeholder="Reference, minute, or confirmation ID"
                        />
                      </div>
                    </div>
                    <Label htmlFor={`graduation-notes-${student.id}`} className="sr-only">Optional Department notes</Label>
                    <Textarea
                      id={`graduation-notes-${student.id}`}
                      value={graduationNotes[student.id] ?? ""}
                      onChange={(event) =>
                        setGraduationNotes((current) => ({
                          ...current,
                          [student.id]: event.target.value,
                        }))
                      }
                      placeholder="Optional Department notes"
                    />
                    <Button
                      disabled={
                        busy === `${student.id}:graduation` ||
                        !graduationDate ||
                        confirmationReference.trim().length < 5
                      }
                      onClick={() =>
                        setPendingAction({ student, action: "graduation", body: {
                          graduationDate,
                          confirmationReference,
                          notes: graduationNotes[student.id],
                        }, rationale: `External confirmation: ${confirmationReference}` })
                      }
                    >
                      {busy === `${student.id}:graduation`
                        ? "Recording..."
                        : "Record graduation"}
                    </Button>
                  </section>
                )}

                {graduated && !archived && (
                  <section className="space-y-3 rounded-md border p-4">
                    <h3 className="font-semibold">
                      3. Archive lifecycle record
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      This makes operational records read-only while retaining
                      documents, audit history, and the original completion
                      date. It does not deactivate Firebase.
                    </p>
                    <Label htmlFor={`archive-reason-${student.id}`} className="sr-only">Archive reason</Label>
                    <Textarea
                      id={`archive-reason-${student.id}`}
                      value={archiveReason}
                      onChange={(event) =>
                        setArchiveReasons((current) => ({
                          ...current,
                          [student.id]: event.target.value,
                        }))
                      }
                      placeholder="Archive reason (at least 10 characters)"
                    />
                    <Button
                      disabled={
                        busy === `${student.id}:archive` ||
                        archiveReason.trim().length < 10
                      }
                      onClick={() => setPendingAction({
                        student,
                        action: "archive",
                        body: { reason: archiveReason },
                        rationale: archiveReason,
                      })}
                    >
                      {busy === `${student.id}:archive`
                        ? "Archiving..."
                        : "Archive record"}
                    </Button>
                  </section>
                )}

                {archived && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    Archived{" "}
                    {student.archive?.archivedAt
                      ? new Date(student.archive.archivedAt).toLocaleDateString()
                      : ""}
                    {student.archive?.reason
                      ? ` · ${student.archive.reason}`
                      : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
