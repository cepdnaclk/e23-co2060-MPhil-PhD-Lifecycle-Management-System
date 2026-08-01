"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";

import {
  applicationProgramTypes,
  applicationStudyModes,
  applicationSubmissionSchema,
  type ApplicationDraftValues,
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
  mimeType: string;
  sizeBytes: number;
};

const stepLabels = ["Applicant", "Research", "Documents", "Review"] as const;
const DRAFT_SESSION_KEY = "pglms.application-draft.v1";
const INITIAL_FORM_VALUES: ApplicationDraftValues = {
  applicantName: "",
  applicantEmail: "",
  applicantPhone: "",
  programType: "MPHIL",
  studyMode: "FULL_TIME",
  proposalTitle: "",
  proposalAbstract: "",
  proposedSupervisorId: "",
  researchArea: "",
  supervisor: "",
  statementOfPurpose: "",
};

const applicantStepSchema = applicationSubmissionSchema.pick({
  applicantName: true,
  applicantEmail: true,
  applicantPhone: true,
});

const researchStepSchema = applicationSubmissionSchema.pick({
  programType: true,
  studyMode: true,
  proposalTitle: true,
  proposalAbstract: true,
  proposedSupervisorId: true,
  researchArea: true,
  supervisor: true,
  statementOfPurpose: true,
});

const documentsStepSchema = z.object({
  supportingDocuments: applicationSubmissionSchema.shape.supportingDocuments,
});

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function ApplicationForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftToken, setDraftToken] = useState<string | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isRemovingDocument, setIsRemovingDocument] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<
    "initializing" | "saved" | "saving" | "unsaved" | "error"
  >("initializing");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draftExpiresAt, setDraftExpiresAt] = useState<string | null>(null);
  const [isReviewConfirmed, setIsReviewConfirmed] = useState(false);
  const [documents, setDocuments] = useState<UploadedSupportingDocument[]>([]);
  const [supervisors, setSupervisors] = useState<
    Array<{ id: string; displayName: string; specialization: string | null }>
  >([]);
  const [formValues, setFormValues] = useState<ApplicationDraftValues>(INITIAL_FORM_VALUES);
  const draftReadyRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const latestSnapshotRef = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const currentStepLabel = useMemo(() => stepLabels[step], [step]);
  const isNavigationBusy =
    isUploadingDocument ||
    isRemovingDocument ||
    isSubmitting ||
    !draftId ||
    !draftToken;

  useEffect(() => {
    let active = true;
    void (async () => {
      const storedCapability = window.sessionStorage.getItem(DRAFT_SESSION_KEY);
      if (storedCapability) {
        try {
          const capability = JSON.parse(storedCapability) as {
            draftId?: string;
            draftToken?: string;
          };
          if (capability.draftId && capability.draftToken) {
            const response = await fetch("/api/applications/drafts", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(capability),
            });
            const payload = (await response.json()) as {
              draft?: {
                values: typeof formValues;
                currentStep: number;
                furthestStep: number;
                savedAt: string;
              } | null;
              documents?: UploadedSupportingDocument[];
              expiresAt?: string;
            };
            if (response.ok) {
              if (!active) return;
              setDraftId(capability.draftId);
              setDraftToken(capability.draftToken);
              setDraftExpiresAt(payload.expiresAt ?? null);
              if (payload.draft) {
                setFormValues(payload.draft.values);
                setStep(payload.draft.currentStep);
                setFurthestStep(payload.draft.furthestStep);
                setSavedAt(payload.draft.savedAt);
                lastSavedSnapshotRef.current = JSON.stringify({
                  values: payload.draft.values,
                  currentStep: payload.draft.currentStep,
                  furthestStep: payload.draft.furthestStep,
                });
              }
              setDocuments(payload.documents ?? []);
              draftReadyRef.current = true;
              setSaveStatus("saved");
              return;
            }
          }
        } catch {
          // Invalid or expired session capabilities are replaced below.
        }
        window.sessionStorage.removeItem(DRAFT_SESSION_KEY);
      }

      const response = await fetch("/api/applications/drafts", { method: "POST" });
      const payload = (await response.json()) as {
        draftId?: string;
        draftToken?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !payload.draftId || !payload.draftToken) {
        throw new Error(payload.error ?? "Unable to initialize the application draft.");
      }
      if (!active) return;
      window.sessionStorage.setItem(
        DRAFT_SESSION_KEY,
        JSON.stringify({ draftId: payload.draftId, draftToken: payload.draftToken }),
      );
      setDraftId(payload.draftId);
      setDraftToken(payload.draftToken);
      setDraftExpiresAt(payload.expiresAt ?? null);
      lastSavedSnapshotRef.current = JSON.stringify({
        values: INITIAL_FORM_VALUES,
        currentStep: 0,
        furthestStep: 0,
      });
      draftReadyRef.current = true;
      setSaveStatus("saved");
    })()
      .catch((error) => {
        if (active) {
          setSaveStatus("error");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to initialize the application draft.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReadyRef.current || !draftId || !draftToken || isSubmitting) return;

    const snapshot = JSON.stringify({
      values: formValues,
      currentStep: step,
      furthestStep,
    });
    latestSnapshotRef.current = snapshot;
    if (snapshot === lastSavedSnapshotRef.current) return;

    setSaveStatus("unsaved");
    const timeout = window.setTimeout(() => {
      setSaveStatus("saving");
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/applications/drafts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draftId,
              draftToken,
              values: formValues,
              currentStep: step,
              furthestStep,
            }),
          });
          const payload = (await response.json()) as {
            savedAt?: string;
            expiresAt?: string;
            error?: string;
          };
          if (!response.ok || !payload.savedAt) {
            throw new Error(payload.error ?? "Unable to save the application draft.");
          }
          lastSavedSnapshotRef.current = snapshot;
          if (latestSnapshotRef.current === snapshot) {
            setSavedAt(payload.savedAt);
            setDraftExpiresAt(payload.expiresAt ?? null);
            setSaveStatus("saved");
          }
        })
        .catch(() => setSaveStatus("error"));
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [draftId, draftToken, formValues, furthestStep, isSubmitting, step]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (saveStatus === "saved" || saveStatus === "initializing") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveStatus]);

  useEffect(() => {
    void fetch("/api/public/supervisors", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          supervisors?: typeof supervisors;
        };
        if (response.ok) {
          const availableSupervisors = payload.supervisors ?? [];
          setSupervisors(availableSupervisors);
          setFormValues((current) => ({
            ...current,
            proposedSupervisorId:
              current.proposedSupervisorId ||
              availableSupervisors[0]?.id ||
              "",
          }));
        }
      })
      .catch(() => setSupervisors([]));
  }, []);

  function updateField(name: keyof typeof formValues, value: string) {
    setIsReviewConfirmed(false);
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function showValidationErrors(error: z.ZodError) {
    const errors = Object.fromEntries(
      error.issues
        .filter((issue) => typeof issue.path[0] === "string")
        .map((issue) => [String(issue.path[0]), issue.message]),
    );
    setFieldErrors(errors);
    const firstIssue = error.issues[0];
    setErrorMessage(firstIssue?.message ?? "Review the highlighted fields.");
    const firstField = firstIssue?.path[0];
    if (typeof firstField === "string") {
      window.requestAnimationFrame(() => {
        document.getElementById(firstField)?.focus();
      });
    }
  }

  function validateStep(stepToValidate: number) {
    if (stepToValidate === 0) {
      const parsed = applicantStepSchema.safeParse({
        applicantName: formValues.applicantName,
        applicantEmail: formValues.applicantEmail,
        applicantPhone: formValues.applicantPhone,
      });

      if (!parsed.success) {
        showValidationErrors(parsed.error);
        return false;
      }
    }

    if (stepToValidate === 1) {
      const parsed = researchStepSchema.safeParse({
        programType: formValues.programType,
        studyMode: formValues.studyMode,
        proposalTitle: formValues.proposalTitle,
        proposalAbstract: formValues.proposalAbstract,
        proposedSupervisorId: formValues.proposedSupervisorId,
        researchArea: formValues.researchArea,
        supervisor: formValues.supervisor,
        statementOfPurpose: formValues.statementOfPurpose,
      });

      if (!parsed.success) {
        showValidationErrors(parsed.error);
        return false;
      }
    }

    if (stepToValidate === 2) {
      const parsed = documentsStepSchema.safeParse({
        supportingDocuments: documents,
      });

      if (!parsed.success) {
        showValidationErrors(parsed.error);
        return false;
      }
    }

    setFieldErrors({});
    return true;
  }

  function moveToStep(nextStepIndex: number) {
    setStep(nextStepIndex);
    setFurthestStep((current) => Math.max(current, nextStepIndex));
  }

  async function handleDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }
    if (!draftId || !draftToken) {
      setErrorMessage("The protected application draft is not ready yet.");
      event.target.value = "";
      return;
    }

    if (documents.length + selectedFiles.length > 10) {
      setErrorMessage(
        "A maximum of 10 supporting documents can be uploaded.",
      );
      event.target.value = "";
      return;
    }

    setErrorMessage(null);
    setIsUploadingDocument(true);

    try {
      const uploadedDocuments: UploadedSupportingDocument[] = [];

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("draftId", draftId);
        formData.append("draftToken", draftToken);
        formData.append("file", file);

        const uploadResponse = await fetch("/api/applications/upload", {
          method: "POST",
          body: formData,
        });

        const uploadPayload = (await uploadResponse.json()) as {
          error?: string;
          storagePath?: string;
          fileName?: string;
          mimeType?: string;
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

        uploadedDocuments.push({
          fileName: uploadPayload.fileName,
          storagePath: uploadPayload.storagePath,
          mimeType: uploadPayload.mimeType,
          sizeBytes: uploadPayload.sizeBytes,
        });
      }

      setDocuments((current) => [
        ...current,
        ...uploadedDocuments.filter(
          (nextDocument) =>
            !current.some(
              (currentDocument) =>
                currentDocument.storagePath === nextDocument.storagePath,
            ),
        ),
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

  async function handleDocumentRemoval(storagePath: string) {
    const document = documents.find((candidate) => candidate.storagePath === storagePath);

    if (!document) {
      return;
    }
    if (!draftId || !draftToken) {
      setErrorMessage("The protected application draft is not ready yet.");
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
          draftToken,
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

      setDocuments((current) =>
        current.filter((candidate) => candidate.storagePath !== storagePath),
      );
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
      draftId,
      draftToken,
      ...formValues,
      supportingDocuments: documents,
    });

    if (!parsed.success) {
      showValidationErrors(parsed.error);
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
        application?: { id?: string; submittedAt?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Application submission failed.");
      }

      setStep(0);
      setFurthestStep(0);
      setDocuments([]);
      setFormValues(INITIAL_FORM_VALUES);
      setIsReviewConfirmed(false);
      window.sessionStorage.removeItem(DRAFT_SESSION_KEY);
      const reference = payload.application?.id;
      const submittedAt = payload.application?.submittedAt;
      const params = new URLSearchParams();
      if (reference) params.set("reference", reference);
      if (submittedAt) params.set("submittedAt", submittedAt);
      router.push(params.size > 0 ? `/apply/success?${params.toString()}` : "/apply/success");
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
          Complete the public application form, upload supporting PDF/ZIP documents, and
          submit your research interest for review.
        </p>
        <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-foreground">
            {saveStatus === "initializing"
              ? "Preparing protected draft..."
              : saveStatus === "saving"
                ? "Saving changes..."
                : saveStatus === "unsaved"
                  ? "Changes waiting to save"
                  : saveStatus === "error"
                    ? "Draft save interrupted"
                    : savedAt
                      ? `Draft saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Protected draft ready"}
          </span>
          <span className="text-muted-foreground">
            {saveStatus === "error"
              ? "Keep this page open; saving will retry after your next change."
              : draftExpiresAt
                ? `Recoverable in this browser session until ${new Date(draftExpiresAt).toLocaleString()}.`
                : "Your typed answers will be saved with this protected session."}
          </span>
        </div>
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
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
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
                aria-invalid={Boolean(fieldErrors.applicantName)}
                aria-describedby={fieldErrors.applicantName ? "applicantName-error" : undefined}
                value={formValues.applicantName}
                onChange={(event) =>
                  updateField("applicantName", event.target.value)
                }
                placeholder="Applicant full name"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="applicantName-error" message={fieldErrors.applicantName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicantEmail">Email</Label>
              <Input
                id="applicantEmail"
                aria-invalid={Boolean(fieldErrors.applicantEmail)}
                aria-describedby={fieldErrors.applicantEmail ? "applicantEmail-error" : undefined}
                value={formValues.applicantEmail}
                onChange={(event) =>
                  updateField("applicantEmail", event.target.value)
                }
                placeholder="name@example.com"
                type="email"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="applicantEmail-error" message={fieldErrors.applicantEmail} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="applicantPhone">Phone</Label>
              <Input
                id="applicantPhone"
                aria-invalid={Boolean(fieldErrors.applicantPhone)}
                aria-describedby={fieldErrors.applicantPhone ? "applicantPhone-error" : undefined}
                value={formValues.applicantPhone}
                onChange={(event) =>
                  updateField("applicantPhone", event.target.value)
                }
                placeholder="+94 7X XXX XXXX"
                type="tel"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="applicantPhone-error" message={fieldErrors.applicantPhone} />
            </div>
          </div>
        )}

        {/* Step 2: Research */}
        {step === 1 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="programType">Programme</Label>
              <Select
                value={formValues.programType}
                onValueChange={(value) => updateField("programType", value)}
              >
                <SelectTrigger id="programType" aria-invalid={Boolean(fieldErrors.programType)} aria-describedby={fieldErrors.programType ? "programType-error" : undefined} className="border-zinc-400 focus-visible:ring-zinc-900">
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
              <FieldError id="programType-error" message={fieldErrors.programType} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studyMode">Study mode</Label>
              <Select
                value={formValues.studyMode}
                onValueChange={(value) => updateField("studyMode", value)}
              >
                <SelectTrigger id="studyMode" aria-invalid={Boolean(fieldErrors.studyMode)} aria-describedby={fieldErrors.studyMode ? "studyMode-error" : undefined} className="border-zinc-400 focus-visible:ring-zinc-900">
                  <SelectValue placeholder="Select study mode" />
                </SelectTrigger>
                <SelectContent>
                  {applicationStudyModes.map((studyMode) => (
                    <SelectItem key={studyMode} value={studyMode}>
                      {studyMode === "FULL_TIME" ? "Full-time" : "Part-time"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="studyMode-error" message={fieldErrors.studyMode} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="researchArea">Research area</Label>
              <Input
                id="researchArea"
                aria-invalid={Boolean(fieldErrors.researchArea)}
                aria-describedby={fieldErrors.researchArea ? "researchArea-error" : undefined}
                value={formValues.researchArea}
                onChange={(event) =>
                  updateField("researchArea", event.target.value)
                }
                placeholder="Machine Learning for Education"
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="researchArea-error" message={fieldErrors.researchArea} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposedSupervisorId">Proposed supervisor</Label>
              <Select
                value={formValues.proposedSupervisorId}
                onValueChange={(value) =>
                  updateField("proposedSupervisorId", value)
                }
              >
                <SelectTrigger id="proposedSupervisorId" aria-invalid={Boolean(fieldErrors.proposedSupervisorId)} aria-describedby={fieldErrors.proposedSupervisorId ? "proposedSupervisorId-error proposedSupervisor-help" : "proposedSupervisor-help"} className="border-zinc-400 focus-visible:ring-zinc-900">
                  <SelectValue placeholder="Select a proposed supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map((supervisor) => (
                    <SelectItem key={supervisor.id} value={supervisor.id}>
                      {supervisor.displayName}
                      {supervisor.specialization
                        ? ` — ${supervisor.specialization}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="proposedSupervisor-help" className="text-xs text-muted-foreground">
                Consent is required before the application can proceed.
              </p>
              <FieldError id="proposedSupervisorId-error" message={fieldErrors.proposedSupervisorId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposalTitle">Proposal title</Label>
              <Input
                id="proposalTitle"
                aria-invalid={Boolean(fieldErrors.proposalTitle)}
                aria-describedby={fieldErrors.proposalTitle ? "proposalTitle-error" : undefined}
                value={formValues.proposalTitle}
                onChange={(event) =>
                  updateField("proposalTitle", event.target.value)
                }
                className="border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="proposalTitle-error" message={fieldErrors.proposalTitle} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposalAbstract">Proposal abstract</Label>
              <Textarea
                id="proposalAbstract"
                aria-invalid={Boolean(fieldErrors.proposalAbstract)}
                aria-describedby={fieldErrors.proposalAbstract ? "proposalAbstract-error" : undefined}
                value={formValues.proposalAbstract}
                onChange={(event) =>
                  updateField("proposalAbstract", event.target.value)
                }
                className="min-h-40 border-zinc-400 focus-visible:ring-zinc-900"
              />
              <FieldError id="proposalAbstract-error" message={fieldErrors.proposalAbstract} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statementOfPurpose">Statement of purpose</Label>
              <Textarea
                id="statementOfPurpose"
                aria-invalid={Boolean(fieldErrors.statementOfPurpose)}
                aria-describedby={fieldErrors.statementOfPurpose ? "statementOfPurpose-error" : undefined}
                value={formValues.statementOfPurpose}
                onChange={(event) =>
                  updateField("statementOfPurpose", event.target.value)
                }
                className="min-h-40 border-zinc-400 focus-visible:ring-zinc-900"
                placeholder="Describe your motivation, proposed area, and fit for the programme."
              />
              <FieldError id="statementOfPurpose-error" message={fieldErrors.statementOfPurpose} />
            </div>
          </div>
        )}

        {/* Step 3: Documents */}
        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div>
                  <Label htmlFor="supportingDocuments" className="text-sm font-semibold text-foreground">Upload supporting documents</Label>
                  <p id="supportingDocuments-help" className="mt-1 text-xs text-muted-foreground">
                    PDF or ZIP only. Maximum file size: 10MB each. Up to 10 files can be uploaded.
                  </p>
                </div>
                <input
                  id="supportingDocuments"
                  aria-invalid={Boolean(fieldErrors.supportingDocuments)}
                  aria-describedby={fieldErrors.supportingDocuments ? "supportingDocuments-help supportingDocuments-error" : "supportingDocuments-help"}
                  className="block w-full cursor-pointer text-sm text-foreground file:mr-4 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground file:transition-all hover:file:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  type="file"
                  accept="application/pdf,application/zip,application/x-zip-compressed,.pdf,.zip"
                  multiple
                  onChange={handleDocumentUpload}
                  disabled={
                    isUploadingDocument ||
                    isRemovingDocument ||
                    !draftId ||
                    !draftToken
                  }
                />
                <FieldError id="supportingDocuments-error" message={fieldErrors.supportingDocuments} />
                {isUploadingDocument && (
                  <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Uploading documents...</p>
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
                          {(document.sizeBytes / (1024 * 1024)).toFixed(2)} MB · {document.mimeType.includes("zip") ? "ZIP" : "PDF"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label="Remove uploaded file"
                        onClick={() => handleDocumentRemoval(document.storagePath)}
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

              <section aria-labelledby="preflight-heading" className="rounded-md border p-4">
                <h3 id="preflight-heading" className="font-semibold text-foreground">
                  Submission checklist
                </h3>
                <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {[
                    "Applicant contact details are complete",
                    "Research proposal details are complete",
                    `${documents.length} supporting document${documents.length === 1 ? "" : "s"} attached`,
                    "Proposed supervisor selected",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

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
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Study mode</p>
                  <p className="mt-1 text-sm text-foreground break-words">
                    {formValues.studyMode === "FULL_TIME" ? "Full-time" : "Part-time"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Research area</p>
                  <p className="mt-1 text-sm text-foreground break-all">{formValues.researchArea}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proposed supervisor</p>
                  <p className="mt-1 text-sm text-foreground break-words">
                    {supervisors.find((supervisor) => supervisor.id === formValues.proposedSupervisorId)?.displayName ?? "Selected supervisor"}
                  </p>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proposal</p>
                <p className="mt-1 text-sm font-medium text-foreground">{formValues.proposalTitle}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {formValues.proposalAbstract}
                </p>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground break-all">
                  {formValues.statementOfPurpose}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supporting Documents</p>
                <ul className="mt-1 space-y-1">
                  {documents.map((document) => (
                    <li key={document.storagePath} className="text-sm text-foreground flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {document.mimeType.includes("zip") ? "ZIP" : "PDF"}
                      </Badge>
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
          <p id="application-navigation-status" className="sr-only" aria-live="polite">
            {isNavigationBusy
              ? isSubmitting
                ? "Application submission is in progress."
                : isUploadingDocument || isRemovingDocument
                  ? "Finish the document operation before changing steps."
                  : "The protected draft is being prepared."
              : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={previousStep}
            disabled={isNavigationBusy}
            aria-describedby={isNavigationBusy ? "application-navigation-status" : undefined}
          >
            Back
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {step < stepLabels.length - 1 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={isNavigationBusy}
                aria-describedby={isNavigationBusy ? "application-navigation-status" : undefined}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || !isReviewConfirmed}
                aria-describedby={!isReviewConfirmed ? "submission-confirmation-help" : undefined}
              >
                {isSubmitting ? "Submitting..." : "Submit application"}
              </Button>
            )}
          </div>
        </div>
        {step === 3 && !isReviewConfirmed ? (
          <p id="submission-confirmation-help" className="text-sm text-muted-foreground">
            Confirm that you reviewed the application before submission becomes available.
          </p>
        ) : null}
      </form>
    </div>
  );
}
