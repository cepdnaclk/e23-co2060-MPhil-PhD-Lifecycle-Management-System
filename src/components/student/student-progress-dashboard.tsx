import type {
  ProgressStepperStep,
  StageProgressSummary,
} from "@/lib/students/progress";

function getStepStateClassName(state: ProgressStepperStep["state"]) {
  switch (state) {
    case "complete":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "current":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    default:
      return "border-slate-800 bg-slate-900/60 text-slate-300";
  }
}

function getStageTone(percentage: number) {
  if (percentage >= 100) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (percentage >= 50) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-slate-800 bg-slate-900/60 text-slate-200";
}

function formatDateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StageCard({
  label,
  value,
}: {
  label: string;
  value: StageProgressSummary;
}) {
  return (
    <article
      className={`rounded-[1.5rem] border px-4 py-4 ${getStageTone(
        value.completionPercentage,
      )}`}
    >
      <p className="text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value.completionPercentage}%</p>
      <p className="mt-3 text-sm">
        Submitted: {value.totalSubmittedVersions} · Approved: {value.approvedVersions}
      </p>
    </article>
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
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/75 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-300">
          Student Progress
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
          Lifecycle dashboard for {progress.student.displayName}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Track milestone readiness across proposal, ethics, data collection, and
          thesis phases with sequential lifecycle gating.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Current milestone
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {progress.currentMilestone}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Estimated completion
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {formatDateLabel(progress.estimatedCompletionDate)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Document approvals
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {progress.counts.approvedDocumentVersions}/
              {progress.counts.totalDocumentVersions}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StageCard label="Proposal" value={progress.stageProgress.proposal} />
        <StageCard label="Ethics" value={progress.stageProgress.ethics} />
        <StageCard
          label="Data Collection"
          value={progress.stageProgress.dataCollection}
        />
        <StageCard label="Thesis" value={progress.stageProgress.thesis} />
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Progress Stepper
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Sequential milestone tracking
            </h3>
          </div>
          <p className="text-sm text-slate-400">
            Examiner feedback stays hidden until results are officially released.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {progress.stepper.map((step, index) => (
            <article
              key={step.id}
              className={`rounded-[1.5rem] border px-4 py-4 ${getStepStateClassName(
                step.state,
              )}`}
            >
              <p className="text-xs uppercase tracking-[0.18em]">
                Step {index + 1}
              </p>
              <h4 className="mt-2 text-lg font-semibold">{step.label}</h4>
              <p className="mt-2 text-sm leading-6">{step.description}</p>
            </article>
          ))}
        </div>

        {progress.examinerFeedbackReleased ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Examination result released. The thesis lifecycle has been finalized.
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            Examiner feedback will appear here once an administrator officially releases the result.
          </div>
        )}
      </section>
    </div>
  );
}
