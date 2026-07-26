"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

type ReviewRole = "supervisor" | "examiner";

type CorrectionQueueItem = {
  id: string;
  requirementType: string;
  requiresExaminerReview: boolean;
  requirements: string;
  studentName: string;
  thesisTitle: string;
  submission: {
    versionNumber: number;
    responseSummary: string;
    documents: Array<{ id: string; fileName: string }>;
  };
};

export function CorrectionReviewPanel({
  role,
  orders,
}: {
  role: ReviewRole;
  orders: CorrectionQueueItem[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(orderId: string, decision: string) {
    setBusyId(orderId);
    setError(null);
    try {
      const response = await secureFetch(
        `/api/${role}/corrections/${orderId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: notes[orderId] }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to record the review.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to record the review.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No correction submissions await your review.
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => (
          <Card key={order.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{order.thesisTitle}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.studentName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge>{order.requirementType}</Badge>
                  <Badge variant="secondary">
                    Version {order.submission.versionNumber}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold">HOD requirements</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {order.requirements}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">Student response</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {order.submission.responseSummary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {order.submission.documents.map((document) => (
                  <SubmissionDocumentDownloadButton
                    key={document.id}
                    documentId={document.id}
                    fileName={document.fileName}
                  />
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`correction-notes-${order.id}`}>
                  Review notes
                </Label>
                <Textarea
                  id={`correction-notes-${order.id}`}
                  value={notes[order.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [order.id]: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busyId === order.id}
                  onClick={() =>
                    void decide(
                      order.id,
                      role === "supervisor" ? "CERTIFY" : "APPROVE",
                    )
                  }
                >
                  {role === "supervisor"
                    ? "Certify corrections"
                    : "Approve corrections"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busyId === order.id}
                  onClick={() => void decide(order.id, "RETURN")}
                >
                  Return to Student
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
