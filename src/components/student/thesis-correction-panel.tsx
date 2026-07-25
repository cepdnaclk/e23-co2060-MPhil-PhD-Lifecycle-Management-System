"use client";

import { secureFetch } from "@/lib/security/client-request";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  correctionSubmissionSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";

type Correction = {
  id: string;
  correctionType: string;
  description: string | null;
  isApproved: boolean;
  createdAt: string | Date;
  documents: Array<{
    id: string;
    fileName: string;
    storagePath: string;
    version: number;
  }>;
};

type ThesisForCorrections = {
  id: string;
  title: string;
  status: string;
  corrections: Correction[];
} | null;

export function ThesisCorrectionPanel({
  thesis,
}: {
  thesis: ThesisForCorrections;
}) {
  const router = useRouter();
  const [correctionType, setCorrectionType] = useState("MINOR");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (nextFiles.length === 0) {
      setFiles([]);
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

    if (!thesis) return;

    setMessage(null);
    setError(null);

    if (files.length === 0) {
      setError("Choose at least one corrected PDF or ZIP document first.");
      return;
    }

    const parsedSubmission = correctionSubmissionSchema.safeParse({
      correctionType,
      description,
      documents: files.map((file) => ({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
    });

    if (!parsedSubmission.success) {
      setError(
        parsedSubmission.error.issues[0]?.message ??
          "Invalid correction submission details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await secureFetch(`/api/theses/${thesis.id}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsedSubmission.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        uploads?: Array<{
          signedUrl: string;
          storagePath: string;
        }>;
      };

      if (!response.ok || !payload.uploads || payload.uploads.length !== files.length) {
        throw new Error(payload.error ?? "Unable to submit corrections.");
      }

      for (const [index, file] of files.entries()) {
        const uploadTarget = payload.uploads[index];
        const uploadResponse = await secureFetch(uploadTarget.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("The correction record was created, but a document upload failed.");
        }
      }

      setMessage("Correction document submitted for administrator approval.");
      setDescription("");
      setFiles([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Correction submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = thesis?.status === "CORRECTIONS_REQUIRED";

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Submit Corrections</h2>
          <p className="text-muted-foreground mt-2">
            Upload corrected thesis files when corrections are required.
          </p>
        </div>
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

      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Submit Corrections</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              {!thesis ? (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No thesis record yet.
                  </p>
                </div>
              ) : !canSubmit ? (
                <div className="rounded-md border p-4 text-sm font-medium">
                  Corrections can only be uploaded while the thesis status is
                  CORRECTIONS REQUIRED. Current status: {thesis?.status.replaceAll("_", " ")}.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Correction type</Label>
                      <Select
                        value={correctionType}
                        onValueChange={(val: string) => setCorrectionType(val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MINOR">Minor</SelectItem>
                          <SelectItem value="MAJOR">Major</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Corrected Documents</Label>
                      <Input
                        type="file"
                        accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                        multiple
                        onChange={handleFileChange}
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
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? "Submitting..." : "Submit correction"}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Correction history</CardTitle>
          </CardHeader>
          <CardContent>
            {!thesis || thesis.corrections.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No corrections submitted.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {thesis?.corrections.map((correction) => (
                  <div
                    key={correction.id}
                    className="rounded-md border p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-semibold">
                          {correction.correctionType} correction
                        </p>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          {new Date(correction.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={correction.isApproved ? "default" : "secondary"}>
                        {correction.isApproved ? "Approved" : "Pending"}
                      </Badge>
                    </div>
                    {correction.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {correction.description}
                      </p>
                    )}
                    <div className="mt-3 space-y-2">
                      {correction.documents.map((document) => (
                        <div
                          key={document.id}
                          className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {document.fileName}
                            </p>
                            <p className="break-all text-xs text-muted-foreground">
                              {document.storagePath}
                            </p>
                          </div>
                          <SubmissionDocumentDownloadButton
                            documentId={document.id}
                            fileName={document.fileName}
                            className="shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
