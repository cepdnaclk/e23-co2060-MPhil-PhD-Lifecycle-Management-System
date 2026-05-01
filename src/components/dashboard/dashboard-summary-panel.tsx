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
    case "warning":
    case "danger":
    case "info":
      return "border border-black bg-transparent text-black";
    case "neutral":
      return "border border-gray-300 bg-transparent text-black";
  }
}

function DashboardKpi({
  card,
}: {
  card: DashboardKpiCard;
}) {
  return (
    <article className="group flex flex-col rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black h-full cursor-default">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-h-[2.8em] flex-1">
          <p className="text-[14px] font-black uppercase tracking-[0.2em] text-gray-400 leading-tight transition-colors group-hover:text-gray-400">
            {card.title}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border-2 px-3 py-1 text-[12px] font-black uppercase tracking-wider transition-colors group-hover:border-white group-hover:text-white ${getStatusBadgeClassName(card.statusTone)}`}
        >
          {card.statusLabel}
        </span>
      </div>
      
      <p className="text-5xl font-black text-black tracking-tighter sm:text-6xl transition-colors group-hover:text-white">
        {card.value}
      </p>
      
      <p className="mt-4 text-sm leading-relaxed text-black/70 font-medium transition-colors group-hover:text-white/80">
        {card.description}
      </p>
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
      className="group flex flex-col justify-center min-h-[120px] rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black"
    >
      <p className="text-xl font-black text-black tracking-tight transition-colors group-hover:text-white">
        {action.label}
      </p>
      <p className="mt-2 text-base leading-snug text-black/70 font-medium transition-colors group-hover:text-white/70">
        {action.description}
      </p>
    </Link>
  );
}

export function DashboardEmptyState({ roleLabel }: { roleLabel: string }) {
  return (
    <section
      className="rounded-[30px] border-2 border-dashed border-gray-300 bg-transparent/40 px-6 py-16 text-center"
      data-testid="dashboard-empty-state"
    >
      <p className="text-base font-bold uppercase tracking-[0.24em] text-black/40">
        {roleLabel}
      </p>
      <h2 className="mt-6 text-4xl font-black text-black tracking-tight">Nothing to show yet</h2>
      <p className="mt-4 text-lg leading-relaxed text-black/60 max-w-lg mx-auto">
        This dashboard will populate once live workflow data becomes available for
        your role.
      </p>
    </section>
  );
}

export function DashboardSkeletonGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-skeleton-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-[24px] bg-gray-200"
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
    <div className="space-y-12">
      <header className="pb-10 border-b-2 border-gray-200">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              {summary.roleLabel} Overview
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              {summary.title}
            </h2>
            <p className="max-w-2xl text-xl leading-relaxed text-black/80 font-medium">
              {summary.subtitle}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {summary.cards.map((card) => (
          <DashboardKpi key={card.id} card={card} />
        ))}
      </section>

      <section className="pt-6">
        <div className="flex items-center gap-4 mb-8">
          <h3 className="text-3xl font-black tracking-tight text-black">Quick Actions</h3>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {summary.quickActions.map((action) => (
            <QuickActionCard key={action.id} action={action} />
          ))}
        </div>
      </section>
    </div>
  );
}
