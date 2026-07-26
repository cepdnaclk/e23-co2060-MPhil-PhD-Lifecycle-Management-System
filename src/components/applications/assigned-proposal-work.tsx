"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

export type AssignedProposalWorkItem = {
  id: string;
  applicantName: string;
  title: string;
  abstract: string;
  versionNumber: number;
};

async function post(path: string, body: unknown) {
  const response = await secureFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Action failed.");
}

export function AssignedProposalReviewPanel({
  assignments,
}: {
  assignments: AssignedProposalWorkItem[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(id: string) {
    setBusy(id);
    setError(null);
    try {
      await post(`/api/proposal-reviewer-assignments/${id}/review`, {
        decision: decisions[id],
        comments: comments[id],
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {assignments.length === 0 ? <p className="text-muted-foreground">No proposal reviews are assigned.</p> : assignments.map((assignment) => (
        <Card key={assignment.id}>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>{assignment.title}</CardTitle><Badge>Version {assignment.versionNumber}</Badge></div><p className="text-sm text-muted-foreground">Applicant: {assignment.applicantName}</p></CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm">{assignment.abstract}</p>
            <select className="h-10 rounded-md border bg-background px-3" value={decisions[assignment.id] ?? ""} onChange={(event) => setDecisions((current) => ({ ...current, [assignment.id]: event.target.value }))}>
              <option value="">Select recommendation</option>
              {["APPROVED", "REVISION_REQUIRED", "REJECTED"].map((decision) => <option key={decision}>{decision}</option>)}
            </select>
            <Textarea value={comments[assignment.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [assignment.id]: event.target.value }))} placeholder="Independent review comments (at least 10 characters)" />
            <Button disabled={busy === assignment.id || !decisions[assignment.id] || (comments[assignment.id]?.trim().length ?? 0) < 10} onClick={() => void submit(assignment.id)}>Submit independent review</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ProposedSupervisorConsentPanel({
  applications,
}: {
  applications: Array<{
    id: string;
    applicantName: string;
    proposalTitle: string | null;
    proposalAbstract: string | null;
  }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function decide(id: string, decision: string) {
    setBusy(id);
    setError(null);
    try {
      await post(`/api/applications/${id}/supervisor-consent`, { decision });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Consent decision failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {applications.length === 0 ? <p className="text-muted-foreground">No consent requests are pending.</p> : applications.map((application) => (
        <Card key={application.id}><CardHeader><CardTitle>{application.proposalTitle ?? "Untitled proposal"}</CardTitle><p className="text-sm text-muted-foreground">Applicant: {application.applicantName}</p></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm">{application.proposalAbstract}</p><div className="flex gap-2"><Button disabled={busy === application.id} onClick={() => void decide(application.id, "CONSENTED")}>Consent</Button><Button variant="outline" disabled={busy === application.id} onClick={() => void decide(application.id, "DECLINED")}>Decline</Button></div></CardContent></Card>
      ))}
    </div>
  );
}
