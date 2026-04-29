import Link from "next/link";

import type {
  DashboardKpiCard,
  DashboardQuickAction,
  DashboardStatusTone,
  DashboardSummary,
} from "@/types/dashboard";

export function getStatusBadgeClassName(tone: DashboardStatusTone) {
  switch (tone) {
    case "success":
      return "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "warning":
      return "border border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "danger":
      return "border border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "info":
      return "border border-sky-400/30 bg-sky-500/10 text-sky-100";
    case "neutral":
      return "border border-slate-700 bg-slate-800/80 text-slate-200";
  }
}

function DashboardKpi({
  card,
}: {
  card: DashboardKpiCard;
}) {
  return (
    <article className="rounded-[1.75rem] border border-slate-800 bg-slate-950/70 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{card.title}</p>
          <p className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            {card.value}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClassName(card.statusTone)}`}
        >
          {card.statusLabel}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{card.description}</p>
    </article>
  );
}

function QuickActionCard({
  action,
}: {
  action: DashboardQuickAction;
}) {
  return (
    <Link
      href={action.href}
      className="group rounded-[1.75rem] border border-slate-800 bg-slate-950/70 p-5 transition hover:border-sky-400/60 hover:bg-slate-900/90"
    >
      <p className="text-base font-semibold text-white transition group-hover:text-sky-200">
        {action.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{action.description}</p>
    </Link>
  );
}

export function DashboardEmptyState({ roleLabel }: { roleLabel: string }) {
  return (
    <section
      className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/60 px-5 py-10 text-center sm:px-8"
      data-testid="dashboard-empty-state"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">
        {roleLabel}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Nothing to show yet</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        This dashboard will populate once live workflow data becomes available for
        your role.
      </p>
    </section>
  );
}

export function DashboardSkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-skeleton-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-[1.75rem] border border-slate-800 bg-slate-900/70"
        />
      ))}
    </div>
  );
}

export function DashboardSummaryPanel({
  summary,
}: {
  summary: DashboardSummary;
}) {
  if (summary.cards.length === 0) {
    return <DashboardEmptyState roleLabel={summary.roleLabel} />;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 px-5 py-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
          {summary.roleLabel} Summary
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              {summary.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {summary.subtitle}
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
            Refreshed {new Date(summary.lastUpdatedIso).toLocaleTimeString()}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.cards.map((card) => (
          <DashboardKpi key={card.id} card={card} />
        ))}
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white">Quick actions</h3>
          <p className="mt-2 text-sm text-slate-400">
            Jump straight into the next high-value task for your role.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summary.quickActions.map((action) => (
            <QuickActionCard key={action.id} action={action} />
          ))}
        </div>
      </section>
    </div>
  );
}
