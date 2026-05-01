"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  applicationProgramTypes,
  applicationSubmissionSchema,
} from "@/lib/applications/schemas";

type UploadedSupportingDocument = {
  fileName: string;
  storagePath: string;
  mimeType: "application/pdf";
  sizeBytes: number;
};

const stepLabels = ["Applicant", "Research", "Documents", "Review"] as const;

function createDraftId() {
  return `application-${crypto.randomUUID()}`;
}

export function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [draftId] = useState(() => createDraftId());
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedSupportingDocument[]>([]);
  const [formValues, setFormValues] = useState({
    applicantName: "",
    applicantEmail: "",
    applicantPhone: "",
    programType: "MPHIL" as (typeof applicationProgramTypes)[number],
    researchArea: "",
    statementOfPurpose: "",
  });

  const currentStepLabel = useMemo(() => stepLabels[step], [step]);

  function updateField(name: keyof typeof formValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setErrorMessage(null);
    setIsUploadingDocument(true);

    try {
      const formData = new FormData();
      formData.append("draftId", draftId);
      formData.append("file", file);

      const uploadResponse = await fetch("/api/applications/upload", {
        method: "POST",
        body: formData,
      });

      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        storagePath?: string;
        fileName?: string;
        mimeType?: "application/pdf";
        sizeBytes?: number;
      };

      if (
        !uploadResponse.ok ||
        !uploadPayload.storagePath ||
        !uploadPayload.fileName ||
        !uploadPayload.mimeType ||
        typeof uploadPayload.sizeBytes !== "number"
      ) {
        throw new Error(uploadPayload.error ?? "Unable to upload the selected document.");
      }

      const {
        storagePath,
        fileName,
        mimeType,
        sizeBytes,
      } = uploadPayload;

      setDocuments((current) => [
        ...current,
        {
          fileName,
          storagePath,
          mimeType,
          sizeBytes,
        },
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? "Unable to reach the upload service. Please try again."
          : error instanceof Error
            ? error.message
            : "Unable to upload the selected document.",
      );
    } finally {
      setIsUploadingDocument(false);
      event.target.value = "";
    }
  }

  function nextStep() {
    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  function previousStep() {
    setStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsed = applicationSubmissionSchema.safeParse({
      ...formValues,
      supportingDocuments: documents,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? "Invalid application data.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as {
        error?: string;
        application?: {
          id: string;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Application submission failed.");
      }

      setSuccessMessage(
        `Application submitted successfully. Reference: ${payload.application?.id ?? "pending"}.`,
      );
      setStep(0);
      setDocuments([]);
      setFormValues({
        applicantName: "",
        applicantEmail: "",
        applicantPhone: "",
        programType: "MPHIL",
        researchArea: "",
        statementOfPurpose: "",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Application submission failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl rounded-[30px] bg-[#e0e0e0] p-6 shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] sm:p-10 space-y-8">
      <section className="pb-6 border-b border-gray-300">
        <p className="text-base font-semibold uppercase tracking-[0.26em] text-black">
          Postgraduate Admissions
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-black sm:text-4xl">
          Apply for your research programme
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-6 text-black">
          Complete the public application form, upload supporting PDFs, and submit
          your research interest for review.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stepLabels.map((label, index) => {
          const isCurrent = index === step;
          const isCompleted = index < step;

          return (
            <div
              key={label}
              className={`rounded-2xl border px-4 py-3 text-base transition-colors ${
                isCurrent
                  ? "border-black bg-black/5 text-black font-bold"
                  : isCompleted
                    ? "border-gray-400 bg-transparent text-black"
                    : "border-gray-300 bg-transparent text-gray-500"
              }`}
            >
              <p className="text-base uppercase tracking-[0.2em]">
                Step {index + 1}
              </p>
              <p className="mt-2 font-semibold">{label}</p>
            </div>
          );
        })}
      </section>

      <form className="pt-2" onSubmit={handleSubmit}>
        <div className="mb-6">
          <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
            Current step
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-black">
            {currentStepLabel}
          </h2>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base font-medium text-black">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-5 rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base font-medium text-black">
            {successMessage}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-base text-black">
              <span>Full name</span>
              <input
                value={formValues.applicantName}
                onChange={(event) => updateField("applicantName", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="Applicant full name"
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Email</span>
              <input
                value={formValues.applicantEmail}
                onChange={(event) => updateField("applicantEmail", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="name@example.com"
                type="email"
              />
            </label>
            <label className="space-y-2 text-base text-black sm:col-span-2">
              <span>Phone</span>
              <input
                value={formValues.applicantPhone}
                onChange={(event) => updateField("applicantPhone", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="+94 7X XXX XXXX"
              />
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4">
            <label className="space-y-2 text-base text-black">
              <span>Programme</span>
              <select
                value={formValues.programType}
                onChange={(event) => updateField("programType", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
              >
                {applicationProgramTypes.map((programType) => (
                  <option key={programType} value={programType}>
                    {programType}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Research area</span>
              <input
                value={formValues.researchArea}
                onChange={(event) => updateField("researchArea", event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="Machine Learning for Education"
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Statement of purpose</span>
              <textarea
                value={formValues.statementOfPurpose}
                onChange={(event) =>
                  updateField("statementOfPurpose", event.target.value)
                }
                className="min-h-40 w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
                placeholder="Describe your motivation, proposed area, and fit for the programme."
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
              <p className="text-base font-medium text-black">
                Upload supporting documents
              </p>
              <p className="mt-2 text-base text-black">
                PDF only. Maximum file size: 10MB per document.
              </p>
              <input
                className="mt-4 block w-full text-base text-black file:mr-4 file:rounded-2xl file:border-0 file:bg-black file:px-4 file:py-3 file:font-semibold file:text-black"
                type="file"
                accept="application/pdf"
                onChange={handleDocumentUpload}
                disabled={isUploadingDocument}
              />
              {isUploadingDocument ? (
                <p className="mt-3 text-base text-black">Uploading PDF...</p>
              ) : null}
            </div>

            <div className="space-y-3">
              {documents.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-gray-300 px-4 py-5 text-base text-black">
                  No supporting documents uploaded yet.
                </div>
              ) : (
                documents.map((document) => (
                  <div
                    key={document.storagePath}
                    className="rounded-[1.5rem] border border-gray-200 bg-transparent px-4 py-4"
                  >
                    <p className="font-medium text-black">{document.fileName}</p>
                    <p className="mt-1 text-base uppercase tracking-[0.18em] text-black">
                      {(document.sizeBytes / (1024 * 1024)).toFixed(2)} MB • PDF
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
            <div>
              <p className="text-base font-medium text-black">{formValues.applicantName}</p>
              <p className="text-base text-black">{formValues.applicantEmail}</p>
              <p className="text-base text-black">{formValues.applicantPhone}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-base uppercase tracking-[0.18em] text-black">
                  Programme
                </p>
                <p className="mt-1 text-base text-black">{formValues.programType}</p>
              </div>
              <div>
                <p className="text-base uppercase tracking-[0.18em] text-black">
                  Research area
                </p>
                <p className="mt-1 text-base text-black">{formValues.researchArea}</p>
              </div>
            </div>
            <div>
              <p className="text-base uppercase tracking-[0.18em] text-black">
                Statement
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-black">
                {formValues.statementOfPurpose}
              </p>
            </div>
            <div>
              <p className="text-base uppercase tracking-[0.18em] text-black">
                Supporting PDFs
              </p>
              <ul className="mt-2 space-y-2 text-base text-black">
                {documents.map((document) => (
                  <li key={document.storagePath}>{document.fileName}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 0 || isSubmitting}
            className="group inline-block text-[14px] font-bold bg-black rounded-[0.75em] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block box-border border-2 border-black rounded-[0.75em] px-[1.5em] py-[0.75em] bg-[white] text-black -translate-y-[0.2em] transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
              Back
            </span>
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {step < stepLabels.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="group inline-block text-[14px] font-bold bg-black rounded-[0.75em] cursor-pointer"
              >
                <span className="block box-border border-2 border-black rounded-[0.75em] px-[1.5em] py-[0.75em] bg-[white] text-black -translate-y-[0.2em] transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                  Continue
                </span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="group inline-block text-[14px] font-bold bg-black rounded-[0.75em] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="block box-border border-2 border-black rounded-[0.75em] px-[1.5em] py-[0.75em] bg-[white] text-black -translate-y-[0.2em] transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                  {isSubmitting ? "Submitting..." : "Submit application"}
                </span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
