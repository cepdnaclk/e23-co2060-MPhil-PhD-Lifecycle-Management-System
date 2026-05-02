"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  correctionSubmissionSchema,
  uploadedPdfDocumentSchema,
} from "@/lib/theses/schemas";

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
    <main className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
        <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
          Thesis Corrections
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-black">
          Upload corrected thesis documents
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-6 text-black">
          This workspace opens after a viva outcome requires minor or major
          corrections.
        </p>
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

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-gray-200 bg-transparent p-6"
        >
          <h2 className="text-xl font-semibold text-black">Submit correction</h2>
          {!thesis ? (
            <p className="mt-4 rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-6 text-base text-black">
              No thesis record is available yet.
            </p>
          ) : !canSubmit ? (
            <p className="mt-4 rounded-[1.5rem] border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
              Corrections can only be uploaded while the thesis status is
              CORRECTIONS REQUIRED. Current status: {thesis.status.replaceAll("_", " ")}.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              <label className="space-y-2 text-base text-black">
                <span>Correction type</span>
                <select
                  value={correctionType}
                  onChange={(event) => setCorrectionType(event.target.value)}
                  className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                >
                  <option value="MINOR">Minor</option>
                  <option value="MAJOR">Major</option>
                </select>
              </label>
              <label className="space-y-2 text-base text-black">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-32 w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                />
              </label>
              <label className="space-y-2 text-base text-black">
                <span>Corrected PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="block w-full text-base text-black file:mr-4 file:rounded-2xl file:border-0 file:bg-black file:px-4 file:py-3 file:font-semibold file:text-black"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-black transition hover:bg-black disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit correction"}
              </button>
            </div>
          )}
        </form>

        <section className="rounded-[2rem] border border-gray-200 bg-transparent p-6">
          <h2 className="text-xl font-semibold text-black">Correction history</h2>
          {!thesis || thesis.corrections.length === 0 ? (
            <p className="mt-4 rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-6 text-base text-black">
              No correction documents have been submitted.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {thesis.corrections.map((correction) => (
                <article
                  key={correction.id}
                  className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-black">
                        {correction.correctionType} correction
                      </p>
                      <p className="mt-1 text-base text-gray-400">
                        {new Date(correction.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-300 px-3 py-1 text-base text-black">
                      {correction.isApproved ? "Approved" : "Pending"}
                    </span>
                  </div>
                  {correction.description ? (
                    <p className="mt-3 text-base leading-6 text-black">
                      {correction.description}
                    </p>
                  ) : null}
                  {correction.documents.map((document) => (
                    <p key={document.id} className="mt-3 break-all text-base text-black">
                      {document.fileName}: {document.storagePath}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
