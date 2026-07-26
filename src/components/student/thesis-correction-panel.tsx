"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";
import {
  orderedCorrectionSubmissionSchema,
  uploadedPdfDocumentSchema,
} from "@/lib/theses/schemas";

type CorrectionOrder = {
  id: string;
  requirementType: "MINOR" | "MAJOR";
  requiresExaminerReview: boolean;
  requirements: string;
  dueDate: string | null;
  status:
    | "ORDERED"
    | "SUBMITTED"
    | "RETURNED"
    | "SUPERVISOR_CERTIFIED"
    | "EXAMINER_APPROVED"
    | "COMPLETION_APPROVED";
  thesis: {
    title: string;
  };
  submissions: Array<{
    id: string;
    versionNumber: number;
    responseSummary: string;
    submittedAt: string;
    returnedAt: string | null;
    returnReason: string | null;
    documents: Array<{
      id: string;
      fileName: string;
    }>;
    reviews: Array<{
      id: string;
      stage: "SUPERVISOR" | "EXAMINER";
      decision: "CERTIFIED" | "APPROVED" | "RETURNED";
      notes: string | null;
      reviewer: {
        displayName: string;
      };
    }>;
  }>;
};

export function ThesisCorrectionPanel({
  order,
}: {
  order: CorrectionOrder | null;
}) {
  const router = useRouter();
  const [responseSummary, setResponseSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    for (const nextFile of nextFiles) {
      const parsedDocument = uploadedPdfDocumentSchema.safeParse({
        fileName: nextFile.name,
        mimeType: nextFile.type,
        sizeBytes: nextFile.size,
      });
      if (!parsedDocument.success) {
        setError(
          parsedDocument.error.issues[0]?.message ??
            "Choose valid corrected PDF or ZIP documents.",
        );
        setFiles([]);
        event.target.value = "";
        return;
      }
    }
    setError(null);
    setFiles(nextFiles);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;

    setMessage(null);
    setError(null);
    if (files.length === 0) {
      setError("Choose at least one corrected PDF or ZIP document.");
      return;
    }

    setIsSubmitting(true);
    let uploadSessionId: string | null = null;
    try {
      const prepareResponse = await secureFetch(
        `/api/student/corrections/${order.id}/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            files: files.map((file) => ({
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
            })),
          }),
        },
      );
      const prepared = (await prepareResponse.json()) as {
        error?: string;
        uploadSessionId?: string;
        uploads?: Array<{ signedUrl: string | null }>;
      };
      if (
        !prepareResponse.ok ||
        !prepared.uploadSessionId ||
        prepared.uploads?.length !== files.length
      ) {
        throw new Error(
          prepared.error ?? "Unable to prepare correction uploads.",
        );
      }

      uploadSessionId = prepared.uploadSessionId;
      for (const [index, file] of files.entries()) {
        const signedUrl = prepared.uploads[index]?.signedUrl;
        if (!signedUrl) {
          throw new Error("A correction upload target was not available.");
        }
        const uploaded = await secureFetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploaded.ok) {
          throw new Error("A correction document upload failed.");
        }
      }

      const finalization = orderedCorrectionSubmissionSchema.safeParse({
        responseSummary,
        uploadSessionId,
      });
      if (!finalization.success) {
        throw new Error(
          finalization.error.issues[0]?.message ??
            "Invalid correction submission.",
        );
      }
      const response = await secureFetch(
        `/api/student/corrections/${order.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalization.data),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        submission?: { id: string };
      };
      if (!response.ok || !payload.submission) {
        throw new Error(payload.error ?? "Unable to submit corrections.");
      }

      setMessage(
        "Verified corrections submitted for primary Supervisor certification.",
      );
      setResponseSummary("");
      setFiles([]);
      router.refresh();
    } catch (caught) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Correction submission failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit =
    order?.status === "ORDERED" || order?.status === "RETURNED";

  return (
    <div className="flex-1 space-y-5 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Ordered Thesis Corrections
        </h2>
        <p className="mt-2 text-muted-foreground">
          Submit evidence against the correction requirement recorded by the
          HOD.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-50 p-4 text-sm text-green-800">
          {message}
        </div>
      )}

      {!order ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No HOD correction order is recorded for your current thesis.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{order.thesis.title}</CardTitle>
                <Badge>
                  {order.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Type:</strong> {order.requirementType}
                </p>
                <p>
                  <strong>Examiner review:</strong>{" "}
                  {order.requiresExaminerReview ? "Required" : "Not required"}
                </p>
                {order.dueDate && (
                  <p>
                    <strong>Due:</strong>{" "}
                    {new Date(order.dueDate).toLocaleDateString()}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {order.requirements}
                </p>
              </div>

              {canSubmit ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="correction-response">
                      Response to requirements
                    </Label>
                    <Textarea
                      id="correction-response"
                      value={responseSummary}
                      onChange={(event) =>
                        setResponseSummary(event.target.value)
                      }
                      className="min-h-36"
                      placeholder="Explain how every ordered correction was addressed."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="correction-files">
                      Corrected thesis and response package
                    </Label>
                    <Input
                      id="correction-files"
                      type="file"
                      accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                      multiple
                      onChange={handleFileChange}
                    />
                    {files.length > 0 && (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {files.map((file) => (
                          <li key={`${file.name}-${file.size}`}>{file.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Submitting verified package..."
                      : order.status === "RETURNED"
                        ? "Resubmit corrected package"
                        : "Submit corrected package"}
                  </Button>
                </form>
              ) : (
                <p className="rounded-md border bg-muted/30 p-4 text-sm">
                  This correction version is under Department review. A new
                  version can be submitted only if it is returned.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Version and review history</CardTitle>
            </CardHeader>
            <CardContent>
              {order.submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No correction package submitted yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {order.submissions.map((submission) => (
                    <div key={submission.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">
                          Correction version {submission.versionNumber}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(submission.submittedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {submission.responseSummary}
                      </p>
                      {submission.returnReason && (
                        <p className="mt-3 rounded bg-destructive/10 p-2 text-sm text-destructive">
                          Returned: {submission.returnReason}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {submission.documents.map((document) => (
                          <SubmissionDocumentDownloadButton
                            key={document.id}
                            documentId={document.id}
                            fileName={document.fileName}
                          />
                        ))}
                      </div>
                      {submission.reviews.length > 0 && (
                        <ol className="mt-4 space-y-2 text-sm">
                          {submission.reviews.map((review) => (
                            <li key={review.id}>
                              {review.stage}: {review.decision} by{" "}
                              {review.reviewer.displayName}
                              {review.notes ? ` — ${review.notes}` : ""}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
