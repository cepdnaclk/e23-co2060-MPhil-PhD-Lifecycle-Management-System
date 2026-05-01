"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

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
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose a PDF thesis document first.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          abstract,
          document: {
            fileName: file.name,
            mimeType: "application/pdf",
            sizeBytes: file.size,
          },
        }),
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
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          Thesis Submission
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">
              Submit final thesis
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Upload the final PDF manuscript for examination. Resubmissions
              create a new document version while keeping prior files visible.
            </p>
          </div>
          {thesis ? (
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
              {thesis.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[1.5rem] border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6"
        >
          <h2 className="text-xl font-semibold text-white">
            {thesis ? "Submit a thesis revision" : "Create thesis submission"}
          </h2>
          <div className="mt-5 grid gap-4">
            <label className="space-y-2 text-sm text-slate-200">
              <span>Thesis title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>Abstract</span>
              <textarea
                value={abstract}
                onChange={(event) => setAbstract(event.target.value)}
                className="min-h-40 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                required
              />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span>Thesis PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-sky-400 file:px-4 file:py-3 file:font-semibold file:text-slate-950"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : thesis ? "Submit revision" : "Submit thesis"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6">
          <h2 className="text-xl font-semibold text-white">Thesis record</h2>
          {!thesis ? (
            <p className="mt-4 rounded-[1.5rem] border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
              No thesis has been submitted yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Thesis ID
                </p>
                <p className="mt-1 break-all text-sm text-sky-200">{thesis.id}</p>
                <h3 className="mt-4 text-lg font-semibold text-white">{thesis.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {thesis.abstract}
                </p>
              </div>
              {thesis.documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{document.fileName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Version {document.version}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200">
                      {document.isCurrentVersion ? "Current" : "Previous"}
                    </span>
                  </div>
                  <p className="mt-3 break-all text-xs text-slate-400">
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
