"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { z } from "zod";

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

const applicantStepSchema = applicationSubmissionSchema.pick({
  applicantName: true,
  applicantEmail: true,
  applicantPhone: true,
});

const researchStepSchema = applicationSubmissionSchema.pick({
  programType: true,
  researchArea: true,
  statementOfPurpose: true,
});

const documentsStepSchema = z.object({
  supportingDocuments: applicationSubmissionSchema.shape.supportingDocuments,
});

function createDraftId() {
  return `application-${crypto.randomUUID()}`;
}

export function ApplicationForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draftId] = useState(() => createDraftId());
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReviewConfirmed, setIsReviewConfirmed] = useState(false);
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
    setIsReviewConfirmed(false);
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
      setIsReviewConfirmed(false);
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
    setErrorMessage(null);

    if (step === 0) {
      const parsed = applicantStepSchema.safeParse({
        applicantName: formValues.applicantName,
        applicantEmail: formValues.applicantEmail,
        applicantPhone: formValues.applicantPhone,
      });

      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? "Complete the applicant details before continuing.");
        return;
      }
    }

    if (step === 1) {
      const parsed = researchStepSchema.safeParse({
        programType: formValues.programType,
        researchArea: formValues.researchArea,
        statementOfPurpose: formValues.statementOfPurpose,
      });

      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? "Complete the research details before continuing.");
        return;
      }
    }

    if (step === 2) {
      const parsed = documentsStepSchema.safeParse({
        supportingDocuments: documents,
      });

      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? "Upload at least one supporting document before continuing.");
        return;
      }
    }

    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  function previousStep() {
    setErrorMessage(null);
    setIsReviewConfirmed(false);
    if (step === 0) {
      router.push("/");
    } else {
      setStep((current) => Math.max(current - 1, 0));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

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
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Application submission failed.");
      }

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
      setIsReviewConfirmed(false);
      router.push("/apply/success");
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
    <div className="mx-auto max-h-full w-full max-w-5xl overflow-y-auto rounded-[30px] bg-[#e0e0e0] px-6 pt-6 pb-8 shadow-[15px_15px_30px_#bebebe,-15px_-15px_30px_#ffffff] sm:px-8 sm:pt-8 sm:pb-10 space-y-6">
      <section className="border-b border-gray-300 pb-5">
        <p className="text-base font-semibold uppercase tracking-[0.26em] text-black">
          Postgraduate Admissions
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-black sm:text-4xl">
          Apply for your research programme
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-6 text-black">
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

      <form className="space-y-5 pt-1" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <p className="text-base font-semibold uppercase tracking-[0.24em] text-black">
            Current step
          </p>
          <h2 className="text-2xl font-semibold text-black">
            {currentStepLabel}
          </h2>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500 bg-red-50 px-4 py-3 text-base font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="space-y-2 text-base text-black">
              <span>Full name</span>
              <input
                value={formValues.applicantName}
                onChange={(event) => updateField("applicantName", event.target.value)}
                className="w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
                placeholder="Applicant full name"
              />
            </label>
            <label className="space-y-2 text-base text-black">
              <span>Email</span>
              <input
                value={formValues.applicantEmail}
                onChange={(event) => updateField("applicantEmail", event.target.value)}
                className="w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
                placeholder="name@example.com"
                type="email"
              />
            </label>
            <label className="space-y-2 text-base text-black sm:col-span-2">
              <span>Phone</span>
              <input
                value={formValues.applicantPhone}
                onChange={(event) => updateField("applicantPhone", event.target.value)}
                className="w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
                placeholder="+94 7X XXX XXXX"
              />
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3.5">
            <label className="space-y-2 text-base text-black">
              <span>Programme</span>
              <select
                value={formValues.programType}
                onChange={(event) => updateField("programType", event.target.value)}
                className="w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
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
                className="w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
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
                className="min-h-40 w-full rounded-2xl border border-black bg-transparent px-4 py-3 text-black outline-none focus:border-black"
                placeholder="Describe your motivation, proposed area, and fit for the programme."
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3.5">
            <div className="rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
              <p className="text-base font-medium text-black">
                Upload supporting documents
              </p>
              <p className="mt-2 text-base text-black">
                PDF only. Maximum file size: 10MB per document.
              </p>
              <input
                className="mt-4 block w-full cursor-pointer text-base text-black file:mr-4 file:cursor-pointer file:rounded-full file:border file:border-black/10 file:bg-[linear-gradient(135deg,#fff8f5_0%,#f7f4ee_55%,#eef4ff_100%)] file:px-4 file:py-3 file:font-semibold file:text-black file:transition-all file:duration-200 hover:file:-translate-y-0.5 hover:file:shadow-md"
                type="file"
                accept="application/pdf"
                onChange={handleDocumentUpload}
                disabled={isUploadingDocument}
              />
              {isUploadingDocument ? (
                <p className="mt-3 text-base text-black">Uploading PDF...</p>
              ) : null}
            </div>

            <div className="space-y-2.5">
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
          <div className="space-y-3.5 rounded-[1.5rem] border border-gray-200 bg-transparent p-4">
            <div className="rounded-2xl border border-gray-300 bg-white/40 px-4 py-3 text-base text-black">
              Review the application details below carefully. If anything is incorrect, use the Back
              button to return and update it before submitting.
            </div>
            <div>
              <p className="text-base font-medium text-black">{formValues.applicantName}</p>
              <p className="text-base text-black">{formValues.applicantEmail}</p>
              <p className="text-base text-black">{formValues.applicantPhone}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <ul className="mt-2 space-y-1.5 text-base text-black">
                {documents.map((document) => (
                  <li key={document.storagePath}>{document.fileName}</li>
                ))}
              </ul>
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-black/15 bg-white/40 px-4 py-3 text-base text-black">
              <input
                type="checkbox"
                checked={isReviewConfirmed}
                onChange={(event) => setIsReviewConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 accent-black"
              />
              <span>
                I have reviewed the application details and confirm they are correct before submission.
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={isSubmitting}
            className="theme-button theme-button--compact theme-button--black"
          >
            <span className="theme-button__label">
              Back
            </span>
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {step < stepLabels.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="theme-button theme-button--compact"
              >
                <span className="theme-button__label">
                  Continue
                </span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !isReviewConfirmed}
                className="theme-button theme-button--compact"
              >
                <span className="theme-button__label">
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
