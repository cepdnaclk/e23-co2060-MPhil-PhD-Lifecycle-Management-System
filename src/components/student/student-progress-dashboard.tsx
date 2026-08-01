import {
  Archive,
  Check,
  Clock3,
  FileCheck2,
  Flag,
  GraduationCap,
} from "lucide-react";

import type {
  ProgressStepperStep,
  StageProgressSummary,
} from "@/lib/students/progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function getStageStatus(value: StageProgressSummary) {
  if (value.completionPercentage >= 100) return "Complete";
  if (value.completionPercentage > 0) return "In progress";
  if (value.totalSubmittedVersions > 0) return "Waiting";
  return "Not started";
}

function StageProgressItem({
  label,
  value,
  className,
}: {
  label: string;
  value: StageProgressSummary;
  className?: string;
}) {
  const status = getStageStatus(value);

  return (
    <div className={cn("space-y-4 px-5 py-5 sm:px-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {value.approvedVersions} approved of {value.totalSubmittedVersions} submitted
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 normal-case",
            status === "Complete" && "border-emerald-700/25 bg-emerald-50 text-emerald-900",
            status === "In progress" && "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          {status}
        </Badge>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Stage completion</span>
          <span className="font-semibold text-foreground">{value.completionPercentage}%</span>
        </div>
        <Progress
          value={value.completionPercentage}
          aria-label={`${label} stage ${value.completionPercentage}% complete`}
        />
      </div>
    </div>
  );
}

function getStepStatus(step: ProgressStepperStep) {
  if (step.state === "complete") return "Complete";
  if (step.state === "current") return "Current";
  return "Upcoming";
}

function LifecycleNotice({
  progress,
}: {
  progress: StudentProgressDashboardProps["progress"];
}) {
  if (progress.lifecycleStatus.archive === "ARCHIVED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-emerald-950">
        <Archive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Lifecycle record archived</p>
          <p className="mt-1 text-sm text-emerald-900">
            Documents and audit history remain retained for institutional records.
          </p>
        </div>
      </div>
    );
  }

  if (progress.lifecycleStatus.graduation === "GRADUATED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-emerald-950">
        <GraduationCap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Graduation confirmed</p>
          <p className="mt-1 text-sm text-emerald-900">
            Graduation has been recorded. Archiving remains a separate administrative step.
          </p>
        </div>
      </div>
    );
  }

  if (progress.lifecycleStatus.completion === "COMPLETED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-emerald-950">
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Programme completion recorded</p>
          <p className="mt-1 text-sm text-emerald-900">
            Graduation will be recorded only after external confirmation.
          </p>
        </div>
      </div>
    );
  }

  if (progress.lifecycleStatus.completion === "HOD_APPROVED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-foreground">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Completion awaiting final recording</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The HOD approved academic completion. PG Coordinator recording is pending.
          </p>
        </div>
      </div>
    );
  }

  if (progress.examinerFeedbackReleased) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-foreground">
        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Examination feedback released</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Academic completion remains a separate HOD and PG Coordinator workflow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3">
      <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">Examination feedback pending</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Feedback will appear here after administrative validation and release.
        </p>
      </div>
    </div>
  );
}

type StudentProgressDashboardProps = {
  progress: {
    student: {
      displayName: string;
      programType: string;
      academicStatus: string;
      enrollmentDate: string | Date;
    };
    currentMilestone: string;
    estimatedCompletionDate: string | Date;
    stageProgress: {
      proposal: StageProgressSummary;
      ethics: StageProgressSummary;
      dataCollection: StageProgressSummary;
      thesis: StageProgressSummary;
    };
    stepper: ProgressStepperStep[];
    counts: {
      totalDocumentVersions: number;
      approvedDocumentVersions: number;
    };
    examinerFeedbackReleased: boolean;
    lifecycleStatus: {
      completion: string | null;
      completionApprovedAt: string | Date | null;
      completedAt: string | Date | null;
      graduation: string | null;
      graduationDate: string | Date | null;
      archive: string | null;
      archivedAt: string | Date | null;
    };
  };
};

export function StudentProgressDashboard({ progress }: StudentProgressDashboardProps) {
  const currentStep = progress.stepper.find((step) => step.id === progress.currentMilestone);

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{progress.student.displayName}</h1>
          <p className="mt-2 text-muted-foreground">
            {progress.student.programType} candidate · Enrolled {formatDate(progress.student.enrollmentDate)}
          </p>
        </div>
        <Badge variant="outline" className="w-fit normal-case">
          {formatStatus(progress.student.academicStatus)}
        </Badge>
      </header>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Flag className="size-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>{currentStep?.label ?? formatStatus(progress.currentMilestone)}</CardTitle>
              <CardDescription className="mt-1">Current lifecycle milestone</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-3 sm:divide-x">
          <div>
            <p className="text-sm text-muted-foreground">Estimated completion</p>
            <p className="mt-1 font-semibold text-foreground">
              {formatDate(progress.estimatedCompletionDate)}
            </p>
          </div>
          <div className="sm:pl-5">
            <p className="text-sm text-muted-foreground">Approved documents</p>
            <p className="mt-1 font-semibold text-foreground">
              {progress.counts.approvedDocumentVersions} of {progress.counts.totalDocumentVersions}
            </p>
          </div>
          <div className="sm:pl-5">
            <p className="text-sm text-muted-foreground">Academic standing</p>
            <p className="mt-1 font-semibold text-foreground">
              {formatStatus(progress.student.academicStatus)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Stage progress</CardTitle>
          <CardDescription>Completion across the four main research stages.</CardDescription>
        </CardHeader>
        <CardContent className="grid p-0 sm:grid-cols-2 lg:grid-cols-4">
          <StageProgressItem
            label="Proposal"
            value={progress.stageProgress.proposal}
            className="border-b sm:border-r lg:border-b-0"
          />
          <StageProgressItem
            label="Ethics"
            value={progress.stageProgress.ethics}
            className="border-b lg:border-b-0 lg:border-r"
          />
          <StageProgressItem
            label="Data collection"
            value={progress.stageProgress.dataCollection}
            className="border-b sm:border-b-0 sm:border-r"
          />
          <StageProgressItem label="Thesis" value={progress.stageProgress.thesis} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle timeline</CardTitle>
          <CardDescription>
            Milestones unlock in sequence as reviews and approvals are recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-0">
            {progress.stepper.map((step, index) => {
              const status = getStepStatus(step);
              const isLast = index === progress.stepper.length - 1;

              return (
                <li key={step.id} className="relative flex gap-4 pb-7 last:pb-0">
                  {!isLast && (
                    <span
                      className={cn(
                        "absolute left-[17px] top-9 h-[calc(100%-2rem)] w-px",
                        step.state === "complete" ? "bg-primary/40" : "bg-border",
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={cn(
                      "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background",
                      step.state === "complete" && "border-primary bg-primary text-primary-foreground",
                      step.state === "current" && "border-primary text-primary ring-4 ring-primary/10",
                      step.state === "upcoming" && "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {step.state === "complete" ? (
                      <Check className="size-4" />
                    ) : step.state === "current" ? (
                      <Clock3 className="size-4" />
                    ) : (
                      <span className="size-2 rounded-full bg-current" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-semibold text-foreground">{step.label}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit normal-case",
                          step.state === "complete" &&
                            "border-emerald-700/25 bg-emerald-50 text-emerald-900",
                          step.state === "current" && "border-primary/25 bg-primary/10 text-primary",
                        )}
                      >
                        {status}
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <LifecycleNotice progress={progress} />
        </CardContent>
      </Card>
    </div>
  );
}
