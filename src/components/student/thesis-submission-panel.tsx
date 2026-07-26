"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  thesisSubmissionSchema,
  thesisUploadRequestSchema,
  uploadedPdfDocumentSchema,
} from "@/lib/theses/schemas";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";

type ThesisDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string | Date;
};

type ThesisSummary = {
  id: string;
  title: string;
  abstract: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  documents: ThesisDocument[];
} | null;

type ReadinessSummary = {
  id: string;
  decision: string;
  studentMessage: string | null;
  supervisorNotes: string | null;
  hodNotes: string | null;
} | null;

export function ThesisSubmissionPanel({
  thesis,
  readiness,
}: {
  thesis: ThesisSummary;
  readiness: ReadinessSummary;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(thesis?.title ?? "");
  const [abstract, setAbstract] = useState(thesis?.abstract ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentMessage, setStudentMessage] = useState(
    readiness?.studentMessage ?? "",
  );
  const [isRequesting, setIsRequesting] = useState(false);
  const readinessApproved = readiness?.decision === "HOD_APPROVED";
  const canRequestReadiness =
    !readiness ||
    ["PENDING", "RETURNED", "REVOKED"].includes(readiness.decision);

  async function requestReadiness() {
    setIsRequesting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/student/thesis-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentMessage: studentMessage.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to request thesis readiness.");
      }
      setMessage("Thesis readiness requested from your primary Supervisor.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to request thesis readiness.",
      );
    } finally {
      setIsRequesting(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isSubmitting) {
      event.target.value = "";
      return;
    }

    const nextFiles = Array.from(event.target.files ?? []);

    if (nextFiles.length === 0) {
      setFiles([]);
      return;
    }

    if (nextFiles.length > 10) {
      setError("Choose no more than 10 thesis documents per submission.");
      setFiles([]);
      event.target.value = "";
      return;
    }

    for (const nextFile of nextFiles) {
      const parsedDocument = uploadedPdfDocumentSchema.safeParse({
        fileName: nextFile.name,
        mimeType: nextFile.type,
        sizeBytes: nextFile.size,
      });

      if (!parsedDocument.success) {
        setError(
          parsedDocument.error.issues[0]?.message ??
            "Choose valid PDF or ZIP thesis documents.",
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
    setMessage(null);
    setError(null);

    if (files.length === 0) {
      setError("Choose at least one PDF or ZIP thesis document first.");
      return;
    }

    const parsedUpload = thesisUploadRequestSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      files: files.map((file) => ({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
    });

    if (!parsedUpload.success) {
      setError(
        parsedUpload.error.issues[0]?.message ??
          "Invalid thesis submission details.",
      );
      return;
    }

    setIsSubmitting(true);
    let uploadSessionId: string | null = null;

    try {
      const prepareResponse = await secureFetch("/api/theses/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsedUpload.data),
      });
      const preparePayload = (await prepareResponse.json()) as {
        error?: string;
        uploads?: Array<{
          signedUrl: string | null;
          storagePath: string;
        }>;
        uploadSessionId?: string;
      };

      if (
        !prepareResponse.ok ||
        !preparePayload.uploadSessionId ||
        preparePayload.uploads?.length !== files.length
      ) {
        throw new Error(
          preparePayload.error ?? "Unable to prepare the thesis upload.",
        );
      }
      uploadSessionId = preparePayload.uploadSessionId;

      for (const [index, file] of files.entries()) {
        const uploadTarget = preparePayload.uploads[index];
        if (!uploadTarget?.signedUrl) {
          throw new Error(`No upload target was returned for ${file.name}.`);
        }
        const uploadResponse = await secureFetch(uploadTarget.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Thesis file upload failed for ${file.name}.`);
        }
      }

      const parsedSubmission = thesisSubmissionSchema.safeParse({
        title,
        abstract,
        uploadSessionId,
      });
      if (!parsedSubmission.success) {
        throw new Error(
          parsedSubmission.error.issues[0]?.message ??
            "Invalid thesis submission details.",
        );
      }

      const response = await secureFetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsedSubmission.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        thesis?: {
          documents: Array<{ version: number; isCurrentVersion: boolean }>;
        };
      };
      if (!response.ok || !payload.thesis) {
        throw new Error(payload.error ?? "Unable to submit the thesis.");
      }

      const currentVersion = payload.thesis.documents.find(
        (document) => document.isCurrentVersion,
      )?.version;
      setMessage(
        `Thesis version ${currentVersion ?? ""} submitted successfully.`,
      );
      setFiles([]);
      uploadSessionId = null;
      router.refresh();
    } catch (caught) {
      if (uploadSessionId) {
        await secureFetch(`/api/uploads/${uploadSessionId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      setError(caught instanceof Error ? caught.message : "Thesis submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Submit Thesis</h2>
          <p className="text-muted-foreground mt-2">
            Upload thesis PDF/ZIP documents for examination. New submissions create a new version.
          </p>
        </div>
        {thesis && (
          <Badge variant="outline" className="uppercase">
            {thesis.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive-foreground">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Thesis readiness</CardTitle>
            <Badge variant={readinessApproved ? "default" : "secondary"}>
              {readiness?.decision.replaceAll("_", " ") ?? "NOT REQUESTED"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Submission opens only after your request, primary Supervisor
            certification, and HOD approval.
          </p>
          {readiness?.supervisorNotes && (
            <p className="text-sm">Supervisor: {readiness.supervisorNotes}</p>
          )}
          {readiness?.hodNotes && (
            <p className="text-sm">HOD: {readiness.hodNotes}</p>
          )}
          {canRequestReadiness && !thesis && (
            <>
              <Textarea
                aria-label="Message to primary Supervisor"
                placeholder="Optional message to your primary Supervisor"
                maxLength={2_000}
                value={studentMessage}
                onChange={(event) => setStudentMessage(event.target.value)}
              />
              <Button
                type="button"
                disabled={isRequesting}
                onClick={() => void requestReadiness()}
              >
                {isRequesting ? "Requesting…" : "Request readiness"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              {thesis ? "Submit Revision" : "New Submission"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Thesis title</Label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={isSubmitting || !readinessApproved}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Abstract</Label>
                  <Textarea
                    value={abstract}
                    onChange={(event) => setAbstract(event.target.value)}
                    className="min-h-[160px]"
                    disabled={isSubmitting || !readinessApproved}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Thesis Document</Label>
                  <p className="text-sm text-muted-foreground">
                    Upload 1–10 PDF or ZIP files as one thesis version.
                  </p>
                  <Input
                    type="file"
                    multiple
                    accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                    onChange={handleFileChange}
                    disabled={isSubmitting || !readinessApproved}
                    required
                  />
                  {files.length > 0 && (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {files.map((file) => (
                        <li key={`${file.name}-${file.size}`}>{file.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <Button
                type="submit"
                disabled={isSubmitting || !readinessApproved}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : thesis ? "Submit revision" : "Submit thesis"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Thesis record</CardTitle>
          </CardHeader>
          <CardContent>
            {!thesis ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No thesis has been submitted yet.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-md border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Thesis ID
                  </p>
                  <p className="break-all text-sm font-medium mb-3">{thesis.id}</p>
                  <h3 className="text-lg font-bold">{thesis.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {thesis.abstract}
                  </p>
                </div>
                <div className="space-y-4">
                  {thesis.documents.map((document) => (
                    <div
                      key={document.id}
                      className="rounded-md border p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="font-semibold">{document.fileName}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                            Version {document.version}
                          </p>
                        </div>
                        <Badge variant={document.isCurrentVersion ? "default" : "secondary"}>
                          {document.isCurrentVersion ? "Current" : "Previous"}
                        </Badge>
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        {document.storagePath}
                      </p>
                      <SubmissionDocumentDownloadButton
                        documentId={document.id}
                        fileName={document.fileName}
                        className="mt-3"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
