import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  DashboardKpiCard,
  DashboardQuickAction,
  DashboardStatusTone,
  DashboardSummary,
} from "@/types/dashboard";

const toneClasses: Record<
  DashboardStatusTone,
  { icon: string; surface: string; text: string }
> = {
  success: {
    icon: "text-emerald-700",
    surface: "bg-emerald-50",
    text: "text-emerald-800",
  },
  warning: {
    icon: "text-amber-700",
    surface: "bg-amber-50",
    text: "text-amber-900",
  },
  danger: {
    icon: "text-red-700",
    surface: "bg-red-50",
    text: "text-red-800",
  },
  info: {
    icon: "text-blue-700",
    surface: "bg-blue-50",
    text: "text-blue-800",
  },
  neutral: {
    icon: "text-muted-foreground",
    surface: "bg-muted",
    text: "text-foreground/75",
  },
};

export function getStatusIcon(tone: DashboardStatusTone) {
  const className = cn("h-4 w-4", toneClasses[tone].icon);

  switch (tone) {
    case "success":
      return <CheckCircle2 className={className} />;
    case "warning":
    case "danger":
      return <AlertTriangle className={className} />;
    case "info":
      return <Info className={className} />;
    case "neutral":
    default:
      return <Activity className={className} />;
  }
}

function DashboardKpi({ card }: { card: DashboardKpiCard }) {
  const tone = toneClasses[card.statusTone];

  return (
    <article className="min-w-0 basis-[17rem] grow bg-card px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold leading-5 text-foreground/80">
          {card.title}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            tone.surface,
          )}
          aria-hidden="true"
        >
          {getStatusIcon(card.statusTone)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <p className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
          {card.value}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            tone.surface,
            tone.text,
          )}
        >
          {card.statusLabel}
        </span>
      </div>
      <p className="mt-2 max-w-[34ch] text-sm leading-5 text-muted-foreground">
        {card.description}
      </p>
    </article>
  );
}

function QuickActionLink({ action }: { action: DashboardQuickAction }) {
  return (
    <Link
      href={action.href}
      className="group flex min-h-28 min-w-0 basis-[28rem] grow items-center justify-between gap-6 bg-card px-5 py-5 outline-none transition-colors hover:bg-accent/70 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
    >
      <span className="min-w-0">
        <span className="block font-semibold tracking-[-0.01em] text-foreground">
          {action.label}
        </span>
        <span className="mt-1 block max-w-[52ch] text-sm leading-5 text-muted-foreground">
          {action.description}
        </span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function DashboardEmptyState({ roleLabel }: { roleLabel: string }) {
  return (
    <div
      data-testid="dashboard-empty-state"
      className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed bg-card px-6"
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-lg font-semibold">Nothing to show yet</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This {roleLabel} dashboard will populate when workflow data is available.
        </p>
      </div>
    </div>
  );
}

export function DashboardSkeletonGrid() {
  return (
    <div
      data-testid="dashboard-skeleton-grid"
      className="flex flex-wrap gap-px overflow-hidden rounded-2xl border bg-border"
      role="status"
      aria-label="Loading dashboard metrics"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-w-0 basis-[17rem] grow animate-pulse bg-card px-5 py-5 sm:px-6">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="mt-5 h-8 w-14 rounded bg-muted" />
          <div className="mt-3 h-3 w-3/4 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSummaryPanel({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="flex-1 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            {summary.title}
          </h2>
          <p className="mt-2 text-base leading-6 text-muted-foreground">
            {summary.subtitle}
          </p>
        </div>
        <span className="w-fit rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
          {summary.roleLabel} workspace
        </span>
      </div>

      {summary.cards.length === 0 ? (
        <DashboardEmptyState roleLabel={summary.roleLabel} />
      ) : (
        <section aria-labelledby="dashboard-at-a-glance" className="space-y-3">
          <h3 id="dashboard-at-a-glance" className="text-sm font-semibold text-foreground/80">
            At a glance
          </h3>
          <div className="flex flex-wrap gap-px overflow-hidden rounded-2xl border bg-border">
            {summary.cards.map((card) => (
              <DashboardKpi key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {summary.quickActions.length > 0 ? (
        <section aria-labelledby="dashboard-quick-actions" className="space-y-3">
          <div>
            <h3 id="dashboard-quick-actions" className="text-lg font-semibold tracking-[-0.02em]">
              Quick actions
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Continue with the work that needs your attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-px overflow-hidden rounded-2xl border bg-border">
            {summary.quickActions.map((action) => (
              <QuickActionLink key={action.id} action={action} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
