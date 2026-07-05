import type {
  ProgressStepperStep,
  StageProgressSummary,
} from "@/lib/students/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function getStepStateClassName(state: ProgressStepperStep["state"]) {
  switch (state) {
    case "complete":
      return "border-green-500/50 bg-green-500/10";
    case "current":
      return "border-blue-500/50 bg-blue-500/10";
    default:
      return "bg-muted/50";
  }
}

function getStepBadgeVariant(state: ProgressStepperStep["state"]) {
  switch (state) {
    case "complete":
      return "default";
    case "current":
      return "secondary";
    default:
      return "outline";
  }
}

function StageCard({
  label,
  value,
}: {
  label: string;
  value: StageProgressSummary;
}) {
  const isComplete = value.completionPercentage >= 100;

  return (
    <Card className={isComplete ? "border-green-500/50 bg-green-500/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Badge variant={isComplete ? "default" : "secondary"}>
          {isComplete ? "Complete" : "In Progress"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value.completionPercentage}%</div>
        <Progress value={value.completionPercentage} className="mt-3 mb-2 h-2" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {value.approvedVersions}
          </span>{" "}
          approved ·{" "}
          <span className="font-semibold text-foreground">
            {value.totalSubmittedVersions}
          </span>{" "}
          submissions
        </p>
      </CardContent>
    </Card>
  );
}

export function StudentProgressDashboard({
  progress,
}: {
  progress: {
    student: {
      displayName: string;
      programType: string;
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
  };
}) {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{progress.student.displayName}</h2>
          <p className="text-muted-foreground mt-2">
            {progress.student.programType} candidate
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Milestone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{progress.currentMilestone}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Estimated Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(progress.estimatedCompletionDate))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Document Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {progress.counts.approvedDocumentVersions} / {progress.counts.totalDocumentVersions}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StageCard label="Proposal" value={progress.stageProgress.proposal} />
        <StageCard label="Ethics" value={progress.stageProgress.ethics} />
        <StageCard label="Data Collection" value={progress.stageProgress.dataCollection} />
        <StageCard label="Thesis" value={progress.stageProgress.thesis} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lifecycle Stepper</CardTitle>
            <CardDescription>
              Sequential milestone tracking
            </CardDescription>
          </div>
          <Badge variant="outline" className="uppercase">
            Review phase
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            {progress.stepper.map((step, index) => {
              const isComplete = step.state === "complete";
              const isCurrent = step.state === "current";

              return (
                <div
                  key={step.id}
                  className={`rounded-lg border p-6 transition-all ${getStepStateClassName(
                    step.state,
                  )}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Milestone {index + 1}
                    </p>
                    <Badge variant={getStepBadgeVariant(step.state)}>
                      {isComplete ? "Verified" : isCurrent ? "Current" : "Upcoming"}
                    </Badge>
                  </div>
                  <h4 className="text-xl font-bold mb-2">
                    {step.label}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>

          {progress.examinerFeedbackReleased ? (
            <div className="mt-8 rounded-md border border-green-500/50 bg-green-500/10 p-4 text-sm font-medium text-green-700 dark:text-green-400">
              Examination result released. The thesis lifecycle has been officially finalized and archived.
            </div>
          ) : (
            <div className="mt-8 rounded-md border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Examiner feedback will be released after administrative validation.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
