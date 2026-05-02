"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  thesisSubmissionSchema,
  uploadedPdfDocumentSchema,
} from "@/lib/theses/schemas";

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
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Thesis Submission
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-black">
              Submit final thesis
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-6 text-black">
              Upload the final PDF manuscript for examination. Resubmissions
              create a new document version while keeping prior files visible.
            </p>
          </div>
          {thesis ? (
            <span className="rounded-full border border-gray-300 bg-transparent px-3 py-1 text-base font-semibold text-black">
              {thesis.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {message}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-gray-200 bg-transparent p-6"
        >
          <h2 className="text-xl font-semibold text-black">
            {thesis ? "Submit a thesis revision" : "Create thesis submission"}
          </h2>
          <div className="mt-5 grid gap-4">
            <label className="space-y-2 text-base text-black">
              <span>Thesis title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                required
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Abstract</span>
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                className="min-h-40 w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                required
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Thesis PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full text-base text-black file:mr-4 file:rounded-2xl file:border-0 file:bg-black file:px-4 file:py-3 file:font-semibold file:text-black"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 rounded-2xl bg-black px-5 py-3 text-base font-semibold text-black transition hover:bg-black disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : thesis ? "Submit revision" : "Submit thesis"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
          <h2 className="text-xl font-semibold text-black">Thesis record</h2>
          {!thesis ? (
            <p className="mt-4 rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-6 text-base text-black">
              No thesis has been submitted yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
                <p className="text-base uppercase tracking-[0.18em] text-gray-400">
                  Thesis ID
                </p>
                <p className="mt-1 break-all text-base text-black">{thesis.id}</p>
                <h3 className="mt-4 text-lg font-semibold text-black">{thesis.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-base leading-6 text-black">
                  {thesis.abstract}
                </p>
              </div>
              {thesis.documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-black">{document.fileName}</p>
                      <p className="mt-1 text-base uppercase tracking-[0.18em] text-gray-400">
                        Version {document.version}
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-300 px-3 py-1 text-base text-black">
                      {document.isCurrentVersion ? "Current" : "Previous"}
                    </span>
                  </div>
                  <p className="mt-3 break-all text-base text-black">
                    {document.storagePath}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
