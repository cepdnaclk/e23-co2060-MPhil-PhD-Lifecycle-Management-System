"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { secureFetch } from "@/lib/security/client-request";

export function ProposalRevisionForm({
  applicationId,
  revisionToken,
}: {
  applicationId: string;
  revisionToken: string;
}) {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length < 1 || selected.length > 10) {
      setMessage("Choose between one and ten PDF or ZIP files.");
      setFiles([]);
      event.target.value = "";
      return;
    }
    setMessage(null);
    setFiles(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!applicationId || !revisionToken) {
      setMessage("The protected revision link is incomplete.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const draftResponse = await secureFetch("/api/applications/drafts", {
        method: "POST",
      });
      const draft = (await draftResponse.json()) as {
        error?: string;
        draftId?: string;
        draftToken?: string;
      };
      if (!draftResponse.ok || !draft.draftId || !draft.draftToken) {
        throw new Error(
          draft.error ?? "Unable to initialize the protected revision upload.",
        );
      }

      for (const file of files) {
        const formData = new FormData();
        formData.set("draftId", draft.draftId);
        formData.set("draftToken", draft.draftToken);
        formData.set("file", file);
        const uploaded = await secureFetch("/api/applications/upload", {
          method: "POST",
          body: formData,
        });
        const result = (await uploaded.json()) as { error?: string };
        if (!uploaded.ok) {
          throw new Error(result.error ?? `Unable to upload ${file.name}.`);
        }
      }

      const response = await secureFetch(
        `/api/applications/${encodeURIComponent(applicationId)}/proposal-revisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revisionToken,
            draftId: draft.draftId,
            draftToken: draft.draftToken,
            title,
            abstract,
            changeSummary,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit proposal revision.");
      }
      setCompleted(true);
      setMessage(
        "Proposal revision submitted. The assigned Reviewers will assess this exact version.",
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Unable to submit proposal revision.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Revise application proposal</CardTitle>
        <CardDescription>
          This protected link can submit one replacement proposal version and
          cannot be reused.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm" role="status">
            {message}
          </div>
        )}
        {!completed && (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label htmlFor="revision-title" className="text-sm font-medium">
                Revised proposal title
              </label>
              <Input
                id="revision-title"
                required
                minLength={5}
                maxLength={500}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="revision-abstract" className="text-sm font-medium">
                Revised abstract
              </label>
              <Textarea
                id="revision-abstract"
                required
                minLength={20}
                maxLength={20_000}
                rows={10}
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="revision-summary" className="text-sm font-medium">
                Summary of changes
              </label>
              <Textarea
                id="revision-summary"
                required
                minLength={5}
                maxLength={2_000}
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="revision-files" className="text-sm font-medium">
                Revised proposal files (1–10 PDF or ZIP files)
              </label>
              <Input
                id="revision-files"
                required
                multiple
                type="file"
                accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                onChange={selectFiles}
              />
            </div>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                files.length === 0 ||
                title.trim().length < 5 ||
                abstract.trim().length < 20 ||
                changeSummary.trim().length < 5
              }
            >
              {isSubmitting ? "Submitting protected version…" : "Submit revision"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
