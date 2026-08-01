"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";
import { DecisionReviewDialog } from "@/components/ui/decision-review-dialog";
import { WorkflowFeedback } from "@/components/ui/workflow-feedback";
import { Label } from "@/components/ui/label";

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
  const [message, setMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    applicantName: string;
    decision: string;
  } | null>(null);

  async function decide(id: string, decision: string) {
    setBusy(id);
    setError(null);
    try {
      await postDecision(`/api/hod/applications/${id}/decision`, {
        decision,
        reason: reasons[id] ?? "",
      });
      setMessage(`Application decision recorded: ${decision.replaceAll("_", " ").toLowerCase()}.`);
      setCompletedAt(new Date());
      setPendingDecision(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />
      <DecisionReviewDialog
        open={Boolean(pendingDecision)}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
        }}
        title="Record application decision"
        description="Review the Department outcome and rationale before it becomes part of the application record."
        subjectLabel="Applicant"
        subject={pendingDecision?.applicantName ?? ""}
        decision={pendingDecision?.decision.replaceAll("_", " ") ?? ""}
        rationale={pendingDecision ? reasons[pendingDecision.id] : null}
        consequences={[
          "The application status and Department decision history will be updated.",
          "The applicant workflow will follow this outcome.",
          pendingDecision?.decision === "APPROVED"
            ? "Admission execution will become available to the PG Coordinator."
            : "Admission execution will remain unavailable unless a later workflow permits it.",
        ]}
        reversible={pendingDecision?.decision === "REVISION_REQUIRED"}
        destructive={pendingDecision?.decision === "REJECTED"}
        confirmLabel={pendingDecision ? `Record ${pendingDecision.decision.replaceAll("_", " ").toLowerCase()}` : "Record decision"}
        isPending={Boolean(pendingDecision && busy === pendingDecision.id)}
        onConfirm={() => {
          if (pendingDecision) void decide(pendingDecision.id, pendingDecision.decision);
        }}
      />
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
              <Label htmlFor={`application-decision-reason-${application.id}`} className="sr-only">Department decision reason</Label>
              <Textarea
                id={`application-decision-reason-${application.id}`}
                aria-describedby={`application-decision-rationale-help-${application.id}`}
                value={reasons[application.id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [application.id]: event.target.value }))}
                placeholder="Department decision reason (at least 10 characters)"
              />
              <p id={`application-decision-rationale-help-${application.id}`} className="text-xs text-muted-foreground">Provide at least 10 characters explaining the academic basis.</p>
              <div className="flex flex-wrap gap-2">
                {["APPROVED", "REVISION_REQUIRED", "REJECTED"].map((decision) => (
                  <Button
                    key={decision}
                    variant={decision === "APPROVED" ? "default" : "outline"}
                    disabled={!ready || busy === application.id || (reasons[application.id]?.trim().length ?? 0) < 10}
                    aria-describedby={!ready ? `application-decision-help-${application.id}` : undefined}
                    onClick={() => setPendingDecision({ id: application.id, applicantName: application.applicantName, decision })}
                  >
                    {decision.replaceAll("_", " ")}
                  </Button>
                ))}
              </div>
              {!ready ? <p id={`application-decision-help-${application.id}`} className="text-xs text-muted-foreground">Supervisor consent and two completed reviews are required before a decision can be recorded.</p> : null}
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
  const [message, setMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingViva, setPendingViva] = useState<{ id: string; thesisTitle: string } | null>(null);
  async function act(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      await postDecision(path, body);
      setMessage("HOD examination decision recorded.");
      setCompletedAt(new Date());
      setPendingViva(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6">
      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />
      <DecisionReviewDialog
        open={Boolean(pendingViva)}
        onOpenChange={(open) => {
          if (!open) setPendingViva(null);
        }}
        title="Record final viva outcome"
        description="Review the outcome against the examiner recommendations before recording the Department decision."
        subjectLabel="Thesis"
        subject={pendingViva?.thesisTitle ?? ""}
        decision={pendingViva ? (outcomes[pendingViva.id] ?? "").replaceAll("_", " ") : ""}
        rationale={pendingViva ? reasons[pendingViva.id] : null}
        consequences={[
          "The viva outcome will become the authoritative Department result.",
          "The Student and thesis lifecycle will advance according to this outcome.",
          "Correction ordering or completion steps may become available next.",
        ]}
        reversible={false}
        destructive={pendingViva ? outcomes[pendingViva.id] === "FAIL" : false}
        confirmLabel="Record final outcome"
        isPending={Boolean(pendingViva && busy === pendingViva.id)}
        onConfirm={() => {
          if (pendingViva) {
            void act(`/api/hod/vivas/${pendingViva.id}/outcome`, { outcome: outcomes[pendingViva.id], reason: reasons[pendingViva.id] }, pendingViva.id);
          }
        }}
      />
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
            <Label htmlFor={`viva-outcome-${viva.id}`}>Final outcome</Label>
            <select
              id={`viva-outcome-${viva.id}`}
              className="h-10 rounded-md border bg-background px-3"
              value={outcomes[viva.id] ?? ""}
              onChange={(event) => setOutcomes((current) => ({ ...current, [viva.id]: event.target.value }))}
            >
              <option value="">Select outcome</option>
              {["PASS", "MINOR_CORRECTIONS", "MAJOR_CORRECTIONS", "FAIL"].map((outcome) => <option key={outcome}>{outcome}</option>)}
            </select>
            <Label htmlFor={`viva-outcome-reason-${viva.id}`}>Outcome rationale</Label>
            <Textarea id={`viva-outcome-reason-${viva.id}`} aria-describedby={`viva-outcome-reason-help-${viva.id}`} value={reasons[viva.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [viva.id]: event.target.value }))} placeholder="Outcome reason (at least 10 characters)" />
            <p id={`viva-outcome-reason-help-${viva.id}`} className="text-xs text-muted-foreground">Provide at least 10 characters explaining how the evidence supports this outcome.</p>
            <Button disabled={busy === viva.id || !outcomes[viva.id] || (reasons[viva.id]?.trim().length ?? 0) < 10} onClick={() => setPendingViva({ id: viva.id, thesisTitle: viva.thesisTitle })}>Review HOD outcome</Button>
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
                  <Label htmlFor={`correction-requirements-${viva.id}`}>Correction requirements</Label>
                  <Textarea
                    id={`correction-requirements-${viva.id}`}
                    aria-describedby={`correction-requirements-help-${viva.id}`}
                    value={correctionRequirements[viva.id] ?? ""}
                    onChange={(event) =>
                      setCorrectionRequirements((current) => ({
                        ...current,
                        [viva.id]: event.target.value,
                      }))
                    }
                    placeholder="Ordered correction requirements (at least 20 characters)"
                  />
                  <p id={`correction-requirements-help-${viva.id}`} className="text-xs text-muted-foreground">List the required changes in at least 20 characters.</p>
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
  students: Array<{
    id: string;
    studentName: string;
    thesisTitle: string;
    programmeLabel: string;
    milestoneSummary: string;
    ethicsSummary: string;
    thesisVersionSummary: string;
    outcomeSummary: string;
    ready: boolean;
  }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    path: string;
    body: unknown;
    key: string;
    subject: string;
    decision: string;
    rationale?: string;
    reversible: boolean;
    destructive?: boolean;
  } | null>(null);
  const [correctionNotes, setCorrectionNotes] = useState<
    Record<string, string>
  >({});
  const [completionReasons, setCompletionReasons] = useState<
    Record<string, string>
  >({});
  async function act(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      await postDecision(path, body);
      setMessage(`${pendingDecision?.decision ?? "HOD decision"} recorded.`);
      setCompletedAt(new Date());
      setPendingDecision(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-6">
      <WorkflowFeedback error={error} success={message} completedAt={completedAt} />
      <DecisionReviewDialog
        open={Boolean(pendingDecision)}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
        }}
        title="Record completion decision"
        description="Review the academic record and effect of this HOD decision."
        subjectLabel="Record"
        subject={pendingDecision?.subject ?? ""}
        decision={pendingDecision?.decision ?? ""}
        rationale={pendingDecision?.rationale}
        consequences={[
          "The decision will be added to the lifecycle audit history.",
          "The next completion or correction step will follow this outcome.",
          "The Student record will retain the submitted evidence and rationale.",
        ]}
        reversible={pendingDecision?.reversible ?? false}
        destructive={pendingDecision?.destructive}
        confirmLabel={pendingDecision ? pendingDecision.decision : "Record decision"}
        isPending={Boolean(pendingDecision && busy === pendingDecision.key)}
        onConfirm={() => {
          if (pendingDecision) void act(pendingDecision.path, pendingDecision.body, pendingDecision.key);
        }}
      />
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
              <Label htmlFor={`correction-decision-notes-${order.id}`} className="sr-only">HOD correction decision notes</Label>
              <Textarea
                id={`correction-decision-notes-${order.id}`}
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
                  onClick={() => setPendingDecision({
                    path: `/api/hod/corrections/${order.id}/decision`,
                    body: { decision: "APPROVE", notes: correctionNotes[order.id] },
                    key: order.id,
                    subject: order.studentName,
                    decision: "Approve correction completion",
                    rationale: correctionNotes[order.id],
                    reversible: false,
                  })}
                >
                  Approve correction completion
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === order.id}
                  onClick={() => setPendingDecision({
                    path: `/api/hod/corrections/${order.id}/decision`,
                    body: { decision: "RETURN", notes: correctionNotes[order.id] },
                    key: order.id,
                    subject: order.studentName,
                    decision: "Return corrections to Student",
                    rationale: correctionNotes[order.id],
                    reversible: true,
                  })}
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
        {students.map((student) => (
          <Card key={student.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{student.studentName}</p>
                  <p className="text-sm text-muted-foreground">
                    {student.thesisTitle} · {student.programmeLabel}
                  </p>
                </div>
                <Badge variant={student.ready ? "default" : "secondary"}>
                  {student.ready ? "Evidence complete" : "Not ready"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{student.milestoneSummary}</Badge>
                <Badge variant="outline">{student.ethicsSummary}</Badge>
                <Badge variant="outline">{student.thesisVersionSummary}</Badge>
                <Badge variant="outline">{student.outcomeSummary}</Badge>
              </div>
              <Label htmlFor={`completion-reason-${student.id}`} className="sr-only">Academic completion approval reason</Label>
              <Textarea
                id={`completion-reason-${student.id}`}
                aria-describedby={`completion-reason-help-${student.id}`}
                value={completionReasons[student.id] ?? ""}
                onChange={(event) =>
                  setCompletionReasons((current) => ({
                    ...current,
                    [student.id]: event.target.value,
                  }))
                }
                placeholder="Academic completion approval reason (at least 10 characters)"
              />
              <p id={`completion-reason-help-${student.id}`} className="text-xs text-muted-foreground">Provide at least 10 characters explaining the completion evidence.</p>
              <Button
                disabled={
                  !student.ready ||
                  busy === student.id ||
                  (completionReasons[student.id]?.trim().length ?? 0) < 10
                }
                aria-describedby={!student.ready ? `completion-help-${student.id}` : undefined}
                onClick={() => setPendingDecision({
                  path: `/api/hod/students/${student.id}/completion`,
                  body: { comments: completionReasons[student.id] },
                  key: student.id,
                  subject: `${student.studentName} — ${student.thesisTitle}`,
                  decision: "Approve programme completion",
                  rationale: completionReasons[student.id],
                  reversible: false,
                })}
              >
                Approve programme completion
              </Button>
              {!student.ready ? <p id={`completion-help-${student.id}`} className="text-xs text-muted-foreground">All milestone, ethics, thesis, and viva evidence must be complete before approval.</p> : null}
            </CardContent>
          </Card>
        ))}
        {students.length === 0 && <p className="text-muted-foreground">No students await academic completion.</p>}
      </section>
    </div>
  );
}
