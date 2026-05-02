import type {
  ProgressStepperStep,
  StageProgressSummary,
} from "@/lib/students/progress";

function getStepStateClassName(state: ProgressStepperStep["state"]) {
  switch (state) {
    case "complete":
      return "border-emerald-500 bg-emerald-50";
    case "current":
      return "border-sky-500 bg-sky-50";
    default:
      return "border-gray-300 bg-stone-50";
  }
}

function getStepBadgeClassName(state: ProgressStepperStep["state"]) {
  switch (state) {
    case "complete":
      return "border-emerald-600 bg-emerald-100 text-emerald-900";
    case "current":
      return "border-sky-600 bg-sky-100 text-sky-900";
    default:
      return "border-gray-400 bg-stone-100 text-stone-700";
  }
}

function getStageCardClassName(percentage: number) {
  if (percentage >= 100) {
    return "border-2 border-black bg-white";
  }
  return "border-gray-300 bg-white";
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
  const isComplete = value.completionPercentage >= 100;

  return (
    <article
      className={`group relative overflow-hidden rounded-[24px] border p-6 transition-all hover:bg-black ${getStageCardClassName(
        value.completionPercentage,
      )}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/40 transition-colors group-hover:text-white/70">
          {label}
        </p>
        <span className="rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
          {isComplete ? "Complete" : "In Progress"}
        </span>
      </div>
      <p className="mt-4 text-5xl font-black tracking-tighter text-black transition-colors group-hover:text-white sm:text-6xl">
        {value.completionPercentage}%
      </p>
      <p className="mt-4 text-base font-medium leading-relaxed text-black/70 transition-colors group-hover:text-white/80">
        <span className="font-black text-black transition-colors group-hover:text-white">
          {value.approvedVersions}
        </span>{" "}
        approved ·{" "}
        <span className="font-black text-black transition-colors group-hover:text-white">
          {value.totalSubmittedVersions}
        </span>{" "}
        submissions
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
    <div className="space-y-12">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Student Progress
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              {progress.student.displayName}
            </h2>
            <p className="max-w-2xl text-xl font-medium leading-relaxed text-black/80">
              Postgraduate Lifecycle Tracking for {progress.student.programType} Candidate
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-3">
        <div className="group rounded-[24px] border border-gray-300 bg-white px-6 py-6 transition-all hover:bg-black">
          <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/40 transition-colors group-hover:text-white/70">
            Current Milestone
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-black transition-colors group-hover:text-white">
            {progress.currentMilestone}
          </p>
        </div>
        <div className="group rounded-[24px] border border-gray-300 bg-white px-6 py-6 transition-all hover:bg-black">
          <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/40 transition-colors group-hover:text-white/70">
            Estimated Completion
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-black transition-colors group-hover:text-white">
            {formatDateLabel(progress.estimatedCompletionDate)}
          </p>
        </div>
        <div className="group rounded-[24px] border border-gray-300 bg-white px-6 py-6 transition-all hover:bg-black">
          <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/40 transition-colors group-hover:text-white/70">
            Document Approvals
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-black transition-colors group-hover:text-white">
            {progress.counts.approvedDocumentVersions} / {progress.counts.totalDocumentVersions}
          </p>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StageCard label="Proposal" value={progress.stageProgress.proposal} />
        <StageCard label="Ethics" value={progress.stageProgress.ethics} />
        <StageCard
          label="Data Collection"
          value={progress.stageProgress.dataCollection}
        />
        <StageCard label="Thesis" value={progress.stageProgress.thesis} />
      </section>

      <section className="rounded-[24px] border border-gray-300 bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-base font-black uppercase tracking-[0.2em] text-black/40">
                Lifecycle Stepper
              </p>
              <h3 className="text-3xl font-black tracking-tight text-black">
                Sequential milestone tracking
              </h3>
            </div>
            <div className="rounded-full border-2 border-black bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black">
              Confidential Review Phase
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {progress.stepper.map((step, index) => {
              const isComplete = step.state === "complete";
              const isCurrent = step.state === "current";

              return (
                <article
                  key={step.id}
                  className={`group relative rounded-[24px] border p-6 transition-all hover:-translate-y-0.5 ${getStepStateClassName(
                    step.state,
                  )}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-black uppercase tracking-[0.2em] text-black/50">
                      Milestone {index + 1}
                    </p>
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${getStepBadgeClassName(
                        step.state,
                      )}`}
                    >
                      {isComplete ? "Verified" : isCurrent ? "Current" : "Upcoming"}
                    </span>
                  </div>
                  <h4 className="mt-3 text-2xl font-black tracking-tight text-black sm:text-3xl">
                    {step.label}
                  </h4>
                  <p className="mt-4 text-base font-medium leading-relaxed text-black/75">
                    {step.description}
                  </p>
                </article>
              );
            })}
          </div>

          {progress.examinerFeedbackReleased ? (
            <div className="mt-8 rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
              Examination result released. The thesis lifecycle has been officially finalized and archived.
            </div>
          ) : (
            <div className="mt-8 rounded-[24px] border border-dashed border-gray-300 bg-white px-6 py-5">
              <p className="text-base font-medium text-black/70">
                Examiner feedback is currently locked and will be released following administrative validation.
              </p>
            </div>
          )}
      </section>
    </div>
  );
}
