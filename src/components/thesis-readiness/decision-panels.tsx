"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

const CHECKLIST_ITEMS = [
  ["proposal", "Approved proposal remains current"],
  ["milestones", "All fixed progress milestones are complete"],
  ["ethics", "Department ethics gate is satisfied"],
  ["examinationCopy", "The examination copy is ready for submission"],
] as const;

export function SupervisorReadinessPanel({
  requests,
}: {
  requests: Array<{
    id: string;
    studentName: string;
    studentMessage: string | null;
  }>;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "CERTIFIED" | "RETURNED") {
    setBusy(id);
    setError(null);
    try {
      const checklist = Object.fromEntries(
        CHECKLIST_ITEMS.map(([key]) => [key, Boolean(checks[id]?.[key])]),
      );
      const response = await secureFetch(
        `/api/supervisor/thesis-readiness/${id}/certify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            checklist,
            comments: comments[id]?.trim() || undefined,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to decide readiness.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to decide readiness.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Thesis-readiness requests</h2>
        <p className="text-sm text-muted-foreground">
          Only the active primary Supervisor can certify or return a request.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-muted-foreground">No readiness requests await you.</p>
      ) : (
        requests.map((request) => {
          const allChecked = CHECKLIST_ITEMS.every(
            ([key]) => checks[request.id]?.[key],
          );
          return (
            <Card key={request.id}>
              <CardHeader>
                <CardTitle>{request.studentName}</CardTitle>
                <CardDescription>
                  {request.studentMessage || "No Student message supplied."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {CHECKLIST_ITEMS.map(([key, label]) => (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(checks[request.id]?.[key])}
                      onChange={(event) =>
                        setChecks((current) => ({
                          ...current,
                          [request.id]: {
                            ...current[request.id],
                            [key]: event.target.checked,
                          },
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
                <Textarea
                  aria-label={`Readiness notes for ${request.studentName}`}
                  placeholder="Supervisor notes or return reason"
                  value={comments[request.id] ?? ""}
                  onChange={(event) =>
                    setComments((current) => ({
                      ...current,
                      [request.id]: event.target.value,
                    }))
                  }
                />
                <div className="flex gap-2">
                  <Button
                    disabled={busy === request.id || !allChecked}
                    onClick={() => void decide(request.id, "CERTIFIED")}
                  >
                    Certify readiness
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busy === request.id ||
                      (comments[request.id]?.trim().length ?? 0) < 5
                    }
                    onClick={() => void decide(request.id, "RETURNED")}
                  >
                    Return to Student
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </section>
  );
}

export function HodReadinessPanel({
  requests,
}: {
  requests: Array<{
    id: string;
    studentName: string;
    supervisorName: string;
    supervisorNotes: string | null;
  }>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "APPROVED" | "RETURNED") {
    setBusy(id);
    setError(null);
    try {
      const response = await secureFetch(
        `/api/hod/thesis-readiness/${id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            notes: notes[id]?.trim() || undefined,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to decide readiness.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to decide readiness.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Examination readiness</h2>
        <p className="text-sm text-muted-foreground">
          Confirm the primary Supervisor certification before thesis submission.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-muted-foreground">
          No Supervisor-certified requests await HOD approval.
        </p>
      ) : (
        requests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>{request.studentName}</CardTitle>
              <CardDescription>
                Certified by {request.supervisorName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {request.supervisorNotes && (
                <p className="text-sm">{request.supervisorNotes}</p>
              )}
              <Textarea
                aria-label={`HOD readiness notes for ${request.studentName}`}
                placeholder="HOD notes"
                value={notes[request.id] ?? ""}
                onChange={(event) =>
                  setNotes((current) => ({
                    ...current,
                    [request.id]: event.target.value,
                  }))
                }
              />
              <div className="flex gap-2">
                <Button
                  disabled={busy === request.id}
                  onClick={() => void decide(request.id, "APPROVED")}
                >
                  Approve for examination
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy === request.id ||
                    (notes[request.id]?.trim().length ?? 0) < 5
                  }
                  onClick={() => void decide(request.id, "RETURNED")}
                >
                  Return
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}
