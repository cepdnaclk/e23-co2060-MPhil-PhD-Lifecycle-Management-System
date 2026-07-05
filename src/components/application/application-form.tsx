"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { z } from "zod";

import {
  applicationProgramTypes,
  applicationSubmissionSchema,
} from "@/lib/applications/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const [furthestStep, setFurthestStep] = useState(0);
  const [draftId] = useState(() => createDraftId());
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isRemovingDocument, setIsRemovingDocument] = useState(false);
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
  const hasUploadedDocument = documents.length > 0;
  const isNavigationBusy =
    isUploadingDocument || isRemovingDocument || isSubmitting;

  function updateField(name: keyof typeof formValues, value: string) {
    setIsReviewConfirmed(false);
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function validateStep(stepToValidate: number) {
    if (stepToValidate === 0) {
      const parsed = applicantStepSchema.safeParse({
        applicantName: formValues.applicantName,
        applicantEmail: formValues.applicantEmail,
        applicantPhone: formValues.applicantPhone,
      });

      if (!parsed.success) {
        setErrorMessage(
          parsed.error.issues[0]?.message ??
            "Complete the applicant details before continuing.",
        );
        return false;
      }
    }

    if (stepToValidate === 1) {
      const parsed = researchStepSchema.safeParse({
        programType: formValues.programType,
        researchArea: formValues.researchArea,
        statementOfPurpose: formValues.statementOfPurpose,
      });

      if (!parsed.success) {
        setErrorMessage(
          parsed.error.issues[0]?.message ??
            "Complete the research details before continuing.",
        );
        return false;
      }
    }

    if (stepToValidate === 2) {
      const parsed = documentsStepSchema.safeParse({
        supportingDocuments: documents,
      });

      if (!parsed.success) {
        setErrorMessage(
          parsed.error.issues[0]?.message ??
            "Upload a supporting document before continuing.",
        );
        return false;
      }
    }

    return true;
  }

  function moveToStep(nextStepIndex: number) {
    setStep(nextStepIndex);
    setFurthestStep((current) => Math.max(current, nextStepIndex));
  }

  async function handleDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (documents.length > 0) {
      setErrorMessage(
        "Only one supporting document can be uploaded. Remove the current file to upload a new PDF.",
      );
      event.target.value = "";
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
        throw new Error(
          uploadPayload.error ?? "Unable to upload the selected document.",
        );
      }

      const { storagePath, fileName, mimeType, sizeBytes } = uploadPayload;

      setDocuments([
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

  async function handleDocumentRemoval() {
    const document = documents[0];

    if (!document) {
      return;
    }

    setErrorMessage(null);
    setIsRemovingDocument(true);

    try {
      const response = await fetch("/api/applications/upload", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftId,
          storagePath: document.storagePath,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to remove the uploaded document.",
        );
      }

      setDocuments([]);
      setIsReviewConfirmed(false);
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? "Unable to reach the upload service. Please try again."
          : error instanceof Error
            ? error.message
            : "Unable to remove the uploaded document.",
      );
    } finally {
      setIsRemovingDocument(false);
    }
  }

  function goToStep(targetStep: number) {
    if (isNavigationBusy || targetStep === step || targetStep > furthestStep) {
      return;
    }

    setErrorMessage(null);

    if (targetStep > step && !validateStep(step)) {
      return;
    }

    if (targetStep < step) {
      setIsReviewConfirmed(false);
    }

    setStep(targetStep);
  }

  function nextStep() {
    if (isNavigationBusy) {
      return;
    }

    setErrorMessage(null);

    if (!validateStep(step)) {
      return;
    }

    moveToStep(Math.min(step + 1, stepLabels.length - 1));
  }

  function previousStep() {
    if (isNavigationBusy) {
      return;
    }

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
      setFurthestStep(0);
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
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8 max-w-5xl mx-auto w-full">
      <section className="border-b border-gray-300 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.26em] text-muted-foreground">
          Postgraduate Admissions
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Apply for your research programme
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Complete the public application form, upload one supporting PDF, and
          submit your research interest for review.
        </p>
      </section>

      {/* Step Navigator */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stepLabels.map((label, index) => {
          const isCurrent = index === step;
          const isCompleted = index < step;
          const isStepAccessible = index <= furthestStep;

          return (
            <button
              key={label}
              type="button"
              onClick={() => goToStep(index)}
              disabled={!isStepAccessible || isNavigationBusy}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={
                isStepAccessible
                  ? `Go to ${label} step`
                  : `${label} step locked until previous sections are completed`
              }
              className={`rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                isCurrent
                  ? "border-primary bg-primary/5 font-semibold text-primary"
                  : isCompleted
                    ? "border-blue-400 bg-blue-50 text-blue-800"
                    : "border-border/50 bg-transparent text-muted-foreground"
              } ${
                isStepAccessible
                  ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/70"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Step {index + 1}
              </p>
              <p className="mt-1.5 font-semibold text-foreground">{label}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {isCurrent
                  ? "Current step"
                  : isStepAccessible
                    ? "Click to open"
                    : "Locked"}
              </p>
            </button>
          );
        })}
      </section>

      <form className="space-y-5 pt-1" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Current step
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {currentStepLabel}
          </h2>
        </div>

        {errorMessage && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
            {errorMessage}
          </div>
        )}

        {/* Step 1: Applicant */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="applicantName">Full name</Label>
              <Input
                id="applicantName"
                value={formValues.applicantName}
                onChange={(event) =>
                  updateField("applicantName", event.target.value)
                }
                placeholder="Applicant full name"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicantEmail">Email</Label>
              <Input
                id="applicantEmail"
                value={formValues.applicantEmail}
                onChange={(event) =>
                  updateField("applicantEmail", event.target.value)
                }
                placeholder="name@example.com"
                type="email"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="applicantPhone">Phone</Label>
              <Input
                id="applicantPhone"
                value={formValues.applicantPhone}
                onChange={(event) =>
                  updateField("applicantPhone", event.target.value)
                }
                placeholder="+94 7X XXX XXXX"
                type="tel"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
            </div>
          </div>
        )}

        {/* Step 2: Research */}
        {step === 1 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Programme</Label>
              <Select
                value={formValues.programType}
                onValueChange={(value) => updateField("programType", value)}
              >
                <SelectTrigger className="border-zinc-400 focus-visible:ring-zinc-900">
                  <SelectValue placeholder="Select programme" />
                </SelectTrigger>
                <SelectContent>
                  {applicationProgramTypes.map((programType) => (
                    <SelectItem key={programType} value={programType}>
                      {programType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="researchArea">Research area</Label>
              <Input
                id="researchArea"
                value={formValues.researchArea}
                onChange={(event) =>
                  updateField("researchArea", event.target.value)
                }
                placeholder="Machine Learning for Education"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statementOfPurpose">Statement of purpose</Label>
              <Textarea
                id="statementOfPurpose"
                value={formValues.statementOfPurpose}
                onChange={(event) =>
                  updateField("statementOfPurpose", event.target.value)
                }
                className="min-h-40 border-zinc-400 focus-visible:ring-zinc-900"
                placeholder="Describe your motivation, proposed area, and fit for the programme."
              />
            </div>
          </div>
        )}

        {/* Step 3: Documents */}
        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Upload supporting document</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF only. Maximum file size: 10MB. Only one file can be uploaded.
                  </p>
                  {hasUploadedDocument && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remove the current file before selecting another PDF.
                    </p>
                  )}
                </div>
                <input
                  className="block w-full cursor-pointer text-sm text-foreground file:mr-4 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground file:transition-all hover:file:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  type="file"
                  accept="application/pdf"
                  onChange={handleDocumentUpload}
                  disabled={hasUploadedDocument || isUploadingDocument || isRemovingDocument}
                />
                {isUploadingDocument && (
                  <p className="text-sm text-muted-foreground">Uploading PDF...</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {documents.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No supporting document uploaded yet.
                </div>
              ) : (
                documents.map((document) => (
                  <Card key={document.storagePath}>
                    <CardContent className="flex items-center justify-between pt-4 pb-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{document.fileName}</p>
                        <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                          {(document.sizeBytes / (1024 * 1024)).toFixed(2)} MB · PDF
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Remove uploaded file"
                        onClick={handleDocumentRemoval}
                        disabled={isRemovingDocument}
                      >
                        {isRemovingDocument ? "Removing..." : "Remove"}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Review the application details below carefully. If anything is
                incorrect, use the step boxes above or the Back button to update
                it before submitting.
              </div>

              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{formValues.applicantName}</p>
                <p className="text-sm text-muted-foreground">{formValues.applicantEmail}</p>
                <p className="text-sm text-muted-foreground">{formValues.applicantPhone}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Programme</p>
                  <p className="mt-1 text-sm text-foreground break-words">{formValues.programType}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Research area</p>
                  <p className="mt-1 text-sm text-foreground break-all">{formValues.researchArea}</p>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground break-all">
                  {formValues.statementOfPurpose}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supporting PDF</p>
                <ul className="mt-1 space-y-1">
                  {documents.map((document) => (
                    <li key={document.storagePath} className="text-sm text-foreground flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">PDF</Badge>
                      {document.fileName}
                    </li>
                  ))}
                </ul>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReviewConfirmed}
                  onChange={(event) => setIsReviewConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  I have reviewed the application details and confirm they are
                  correct before submission.
                </span>
              </label>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={previousStep}
            disabled={isNavigationBusy}
          >
            Back
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {step < stepLabels.length - 1 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={isNavigationBusy}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || !isReviewConfirmed}
              >
                {isSubmitting ? "Submitting..." : "Submit application"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
