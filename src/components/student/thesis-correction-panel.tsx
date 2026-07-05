"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  correctionSubmissionSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
          "Choose a valid corrected PDF document.",
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

    if (!thesis) return;

    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose a corrected PDF document first.");
      return;
    }

    const parsedSubmission = correctionSubmissionSchema.safeParse({
      correctionType,
      description,
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
          "Invalid correction submission details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/theses/${thesis.id}/corrections`, {
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
        };
      };

      if (!response.ok || !payload.upload?.signedUrl) {
        throw new Error(payload.error ?? "Unable to submit corrections.");
      }

      const uploadResponse = await fetch(payload.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("The correction record was created, but the PDF upload failed.");
      }

      setMessage("Correction document submitted for administrator approval.");
      setDescription("");
      setFile(null);
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
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
                      <Label>Corrected PDF</Label>
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
                    {correction.documents.map((document) => (
                      <p key={document.id} className="mt-2 break-all text-xs text-muted-foreground">
                        {document.fileName}: {document.storagePath}
                      </p>
                    ))}
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
