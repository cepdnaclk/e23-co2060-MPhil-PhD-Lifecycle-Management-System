"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  thesisSubmissionSchema,
  uploadedPdfDocumentSchema,
} from "@/lib/theses/schemas";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

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

export function ThesisSubmissionPanel({ thesis }: { thesis: ThesisSummary }) {
  const router = useRouter();
  const [title, setTitle] = useState(thesis?.title ?? "");
  const [abstract, setAbstract] = useState(thesis?.abstract ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      setFile(null);
      return;
    }

    const parsedDocument = uploadedPdfDocumentSchema.safeParse({
      fileName: nextFile.name,
      mimeType: nextFile.type,
      sizeBytes: nextFile.size,
    });

    if (!parsedDocument.success) {
      setError(
        parsedDocument.error.issues[0]?.message ??
          "Choose a valid PDF thesis document.",
      );
      setFile(null);
      event.target.value = "";
      return;
    }

    setError(null);
    setFile(nextFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose a PDF thesis document first.");
      return;
    }

    const parsedSubmission = thesisSubmissionSchema.safeParse({
      title,
      abstract,
      document: file
        ? {
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }
        : undefined,
    });

    if (!parsedSubmission.success) {
      setError(
        parsedSubmission.error.issues[0]?.message ??
          "Invalid thesis submission details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsedSubmission.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        upload?: {
          signedUrl: string;
          storagePath: string;
          version: number;
        };
      };

      if (!response.ok || !payload.upload?.signedUrl) {
        throw new Error(payload.error ?? "Unable to submit the thesis.");
      }

      const uploadResponse = await fetch(payload.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("The thesis record was created, but the PDF upload failed.");
      }

      setMessage(`Thesis version ${payload.upload.version} submitted successfully.`);
      setFile(null);
      router.refresh();
    } catch (caught) {
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
            Upload the thesis PDF for examination. New submissions create a new version.
          </p>
        </div>
        {thesis && (
          <Badge variant="outline" className="uppercase">
            {thesis.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          {message}
        </div>
      )}

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
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Abstract</Label>
                  <Textarea
                    value={abstract}
                    onChange={(event) => setAbstract(event.target.value)}
                    className="min-h-[160px]"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Thesis PDF</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
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
