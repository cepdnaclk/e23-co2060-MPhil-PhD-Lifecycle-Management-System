"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

async function postDecision(path: string, body: unknown) {
  const response = await secureFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Decision could not be recorded.");
}

export function HodApplicationDecisionPanel({
  applications,
}: {
  applications: Array<{
    id: string;
    applicantName: string;
    programType: string;
    studyMode: string;
    proposalTitle: string | null;
    supervisorConsentStatus: string;
    completedReviews: number;
  }>;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: string) {
    setBusy(id);
    setError(null);
    try {
      await postDecision(`/api/hod/applications/${id}/decision`, {
        decision,
        reason: reasons[id] ?? "",
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {applications.length === 0 ? <p className="text-muted-foreground">No applications await a decision.</p> : applications.map((application) => {
        const ready =
          application.supervisorConsentStatus === "CONSENTED" &&
          application.completedReviews >= 2;
        return (
          <Card key={application.id}>
            <CardHeader>
              <CardTitle>{application.applicantName}</CardTitle>
              <div className="flex gap-2">
                <Badge variant="secondary">{application.programType} {application.studyMode.replaceAll("_", " ")}</Badge>
                <Badge variant={ready ? "default" : "secondary"}>
                  {application.supervisorConsentStatus}; {application.completedReviews}/2 reviews
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-medium">{application.proposalTitle ?? "Untitled proposal"}</p>
              <Textarea
                value={reasons[application.id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [application.id]: event.target.value }))}
                placeholder="Department decision reason (at least 10 characters)"
              />
              <div className="flex flex-wrap gap-2">
                {["APPROVED", "REVISION_REQUIRED", "REJECTED"].map((decision) => (
                  <Button
                    key={decision}
                    variant={decision === "APPROVED" ? "default" : "outline"}
                    disabled={!ready || busy === application.id || (reasons[application.id]?.trim().length ?? 0) < 10}
                    onClick={() => void decide(application.id, decision)}
                  >
                    {decision.replaceAll("_", " ")}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function HodExaminationDecisionPanel({
  assignments,
  vivas,
  correctionVivas,
}: {
  assignments: Array<{ id: string; thesisTitle: string; examinerName: string }>;
  vivas: Array<{ id: string; thesisTitle: string; recommendationCount: number }>;
  correctionVivas: Array<{
    id: string;
    thesisTitle: string;
    outcome: "MINOR_CORRECTIONS" | "MAJOR_CORRECTIONS";
  }>;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [correctionRequirements, setCorrectionRequirements] = useState<
    Record<string, string>
  >({});
  const [examinerReview, setExaminerReview] = useState<Record<string, boolean>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      await postDecision(path, body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Examiner confirmations</h2>
        {assignments.length === 0 ? <p className="text-muted-foreground">No assignments await confirmation.</p> : assignments.map((assignment) => (
          <Card key={assignment.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div><p className="font-medium">{assignment.thesisTitle}</p><p className="text-sm text-muted-foreground">{assignment.examinerName}</p></div>
            <div className="flex gap-2">
              <Button disabled={busy === assignment.id} onClick={() => void act(`/api/hod/examiner-assignments/${assignment.id}/decision`, { decision: "ACCEPTED" }, assignment.id)}>Confirm</Button>
              <Button variant="outline" disabled={busy === assignment.id} onClick={() => void act(`/api/hod/examiner-assignments/${assignment.id}/decision`, { decision: "DECLINED" }, assignment.id)}>Decline</Button>
            </div>
          </CardContent></Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Viva outcomes</h2>
        {vivas.length === 0 ? <p className="text-muted-foreground">No vivas are ready for an outcome.</p> : vivas.map((viva) => (
          <Card key={viva.id}><CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between"><p className="font-medium">{viva.thesisTitle}</p><Badge>{viva.recommendationCount} recommendations</Badge></div>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={outcomes[viva.id] ?? ""}
              onChange={(event) => setOutcomes((current) => ({ ...current, [viva.id]: event.target.value }))}
            >
              <option value="">Select outcome</option>
              {["PASS", "MINOR_CORRECTIONS", "MAJOR_CORRECTIONS", "FAIL"].map((outcome) => <option key={outcome}>{outcome}</option>)}
            </select>
            <Textarea value={reasons[viva.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [viva.id]: event.target.value }))} placeholder="Outcome reason (at least 10 characters)" />
            <Button disabled={busy === viva.id || !outcomes[viva.id] || (reasons[viva.id]?.trim().length ?? 0) < 10} onClick={() => void act(`/api/hod/vivas/${viva.id}/outcome`, { outcome: outcomes[viva.id], reason: reasons[viva.id] }, viva.id)}>Record HOD outcome</Button>
          </CardContent></Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Order corrections</h2>
        {correctionVivas.length === 0 ? (
          <p className="text-muted-foreground">
            No recorded correction outcomes await an order.
          </p>
        ) : (
          correctionVivas.map((viva) => {
            const isMajor = viva.outcome === "MAJOR_CORRECTIONS";
            return (
              <Card key={viva.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">{viva.thesisTitle}</p>
                    <Badge>{viva.outcome.replaceAll("_", " ")}</Badge>
                  </div>
                  <Textarea
                    value={correctionRequirements[viva.id] ?? ""}
                    onChange={(event) =>
                      setCorrectionRequirements((current) => ({
                        ...current,
                        [viva.id]: event.target.value,
                      }))
                    }
                    placeholder="Ordered correction requirements (at least 20 characters)"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isMajor || examinerReview[viva.id] === true}
                      disabled={isMajor}
                      onChange={(event) =>
                        setExaminerReview((current) => ({
                          ...current,
                          [viva.id]: event.target.checked,
                        }))
                      }
                    />
                    Require assigned Thesis Examiner review
                    {isMajor ? " (mandatory for major corrections)" : ""}
                  </label>
                  <Button
                    disabled={
                      busy === viva.id ||
                      (correctionRequirements[viva.id]?.trim().length ?? 0) < 20
                    }
                    onClick={() =>
                      void act(
                        `/api/hod/vivas/${viva.id}/corrections`,
                        {
                          requirementType: isMajor ? "MAJOR" : "MINOR",
                          requirements: correctionRequirements[viva.id],
                          requiresExaminerReview:
                            isMajor || examinerReview[viva.id] === true,
                        },
                        viva.id,
                      )
                    }
                  >
                    Issue correction order
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}

export function HodCompletionDecisionPanel({
  corrections,
  students,
}: {
  corrections: Array<{
    id: string;
    studentName: string;
    requirementType: string;
    requiresExaminerReview: boolean;
    status: string;
    requirements: string;
    submissionCount: number;
  }>;
  students: Array<{ id: string; studentName: string; thesisTitle: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctionNotes, setCorrectionNotes] = useState<
    Record<string, string>
  >({});
  async function act(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      await postDecision(path, body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Correction completion</h2>
        {corrections.map((order) => (
          <Card key={order.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{order.studentName}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.requirementType}; {order.status.replaceAll("_", " ")};{" "}
                    {order.submissionCount} submission(s)
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {order.requirements}
                  </p>
                </div>
                <Badge variant="secondary">
                  Examiner review{" "}
                  {order.requiresExaminerReview ? "required" : "not required"}
                </Badge>
              </div>
              <Textarea
                value={correctionNotes[order.id] ?? ""}
                onChange={(event) =>
                  setCorrectionNotes((current) => ({
                    ...current,
                    [order.id]: event.target.value,
                  }))
                }
                placeholder="HOD correction decision notes"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy === order.id || order.submissionCount === 0}
                  onClick={() =>
                    void act(
                      `/api/hod/corrections/${order.id}/decision`,
                      {
                        decision: "APPROVE",
                        notes: correctionNotes[order.id],
                      },
                      order.id,
                    )
                  }
                >
                  Approve correction completion
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === order.id}
                  onClick={() =>
                    void act(
                      `/api/hod/corrections/${order.id}/decision`,
                      {
                        decision: "RETURN",
                        notes: correctionNotes[order.id],
                      },
                      order.id,
                    )
                  }
                >
                  Return to Student
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {corrections.length === 0 && <p className="text-muted-foreground">No correction orders await closure.</p>}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Academic completion</h2>
        {students.map((student) => <Card key={student.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><div><p className="font-medium">{student.studentName}</p><p className="text-sm text-muted-foreground">{student.thesisTitle}</p></div><Button disabled={busy === student.id} onClick={() => void act(`/api/hod/students/${student.id}/completion`, { comments: "Department academic completion approved." }, student.id)}>Approve programme completion</Button></CardContent></Card>)}
        {students.length === 0 && <p className="text-muted-foreground">No students await academic completion.</p>}
      </section>
    </div>
  );
}
