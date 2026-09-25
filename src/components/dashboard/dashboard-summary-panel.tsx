import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  Inbox,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  DashboardAttentionItem,
  DashboardJourney,
  DashboardKpiCard,
  DashboardQuickAction,
  DashboardStatusTone,
  DashboardSummary,
} from "@/types/dashboard";

const toneClasses: Record<
  DashboardStatusTone,
  { icon: string; surface: string; text: string; dot: string }
> = {
  success: {
    icon: "text-emerald-700",
    surface: "bg-emerald-50",
    text: "text-emerald-900",
    dot: "bg-emerald-600",
  },
  warning: {
    icon: "text-amber-800",
    surface: "bg-amber-50",
    text: "text-amber-950",
    dot: "bg-amber-600",
  },
  danger: {
    icon: "text-red-700",
    surface: "bg-red-50",
    text: "text-red-900",
    dot: "bg-red-600",
  },
  info: {
    icon: "text-primary",
    surface: "bg-accent/65",
    text: "text-accent-foreground",
    dot: "bg-primary",
  },
  neutral: {
    icon: "text-muted-foreground",
    surface: "bg-muted",
    text: "text-foreground/75",
    dot: "bg-muted-foreground",
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

function AttentionItemLink({ item }: { item: DashboardAttentionItem }) {
  const tone = toneClasses[item.tone];

  return (
    <Link
      href={item.href}
      className="group grid min-h-24 grid-cols-[auto_1fr_auto] items-center gap-4 border-t px-5 py-4 outline-none transition-colors first:border-t-0 hover:bg-accent/35 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
    >
      <span
        className={cn(
          "flex h-10 min-w-10 items-center justify-center rounded-xl px-2.5 text-base font-semibold",
          tone.surface,
          tone.text,
        )}
        aria-label={`${item.value} items`}
      >
        {item.value}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold tracking-[-0.01em] text-foreground">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
          {item.title}
        </span>
        <span className="mt-1 block max-w-[62ch] text-sm leading-5 text-muted-foreground">
          {item.description}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

function AttentionPanel({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <section
      aria-labelledby="dashboard-attention"
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <h3
            id="dashboard-attention"
            className="text-xl font-semibold tracking-[-0.02em]"
          >
            Needs your attention
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Work is ordered with the most urgent items first.
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
          {items.length} {items.length === 1 ? "area" : "areas"}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="border-t">
          {items.map((item) => (
            <AttentionItemLink key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-4 border-t bg-emerald-50/70 px-5 py-6 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-emerald-950">No urgent work recorded</p>
            <p className="mt-1 text-sm text-emerald-900/75">
              Your overview will highlight new work here when it needs attention.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function JourneyPanel({ journey }: { journey: DashboardJourney }) {
  return (
    <section
      aria-labelledby="dashboard-journey"
      className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6"
    >
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div>
          <h3
            id="dashboard-journey"
            className="text-xl font-semibold tracking-[-0.02em]"
          >
            {journey.title}
          </h3>
          <p className="mt-1 text-sm leading-5 text-primary-foreground/75">
            {journey.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f2b705] px-2.5 py-1 text-xs font-semibold text-[#2a1800]">
          {journey.currentStage}
        </span>
      </div>

      <ol className="mt-6 space-y-1" aria-label="Programme stages">
        {journey.steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[1.5rem_1fr] gap-3">
            <span className="relative flex justify-center" aria-hidden="true">
              {index < journey.steps.length - 1 ? (
                <span
                  className={cn(
                    "absolute bottom-[-0.35rem] top-5 w-px",
                    step.state === "complete"
                      ? "bg-[#f2b705]"
                      : "bg-primary-foreground/20",
                  )}
                />
              ) : null}
              {step.state === "complete" ? (
                <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#f2b705] text-[#2a1800]">
                  <Check className="h-3 w-3" />
                </span>
              ) : step.state === "current" ? (
                <CircleDot className="relative z-10 h-5 w-5 fill-primary text-[#f2b705]" />
              ) : (
                <Circle className="relative z-10 h-5 w-5 fill-primary text-primary-foreground/35" />
              )}
            </span>
            <span
              className={cn(
                "pb-4 text-sm",
                step.state === "current"
                  ? "font-semibold text-primary-foreground"
                  : step.state === "complete"
                    ? "text-primary-foreground/85"
                    : "text-primary-foreground/55",
              )}
            >
              {step.label}
              {step.state === "current" ? (
                <span className="ml-2 text-xs font-medium text-[#f2b705]">Current</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DashboardKpi({ card }: { card: DashboardKpiCard }) {
  const tone = toneClasses[card.statusTone];

  return (
    <article className="min-w-0 bg-card px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium leading-5 text-muted-foreground">
          {card.title}
        </p>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">
        {card.value}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {getStatusIcon(card.statusTone)}
        <span className={cn("text-xs font-semibold", tone.text)}>
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
      className="group flex items-center justify-between gap-5 border-t px-5 py-4 outline-none transition-colors first:border-t-0 hover:bg-accent/35 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
    >
      <span className="min-w-0">
        <span className="block font-semibold tracking-[-0.01em] text-foreground">
          {action.label}
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">
          {action.description}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

function ContinueWorkPanel({ actions }: { actions: DashboardQuickAction[] }) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="dashboard-continue-work"
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <div className="px-5 py-5 sm:px-6">
        <h3
          id="dashboard-continue-work"
          className="text-xl font-semibold tracking-[-0.02em]"
        >
          Continue your work
        </h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Shortcuts for the work you are most likely to continue next.
        </p>
      </div>
      <div className="border-t">
        {actions.map((action) => (
          <QuickActionLink key={action.id} action={action} />
        ))}
      </div>
    </section>
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
      className="overflow-hidden rounded-2xl border bg-card"
      role="status"
      aria-label="Loading dashboard overview"
    >
      <div className="animate-pulse bg-primary px-5 py-8 sm:px-8">
        <div className="h-8 w-48 rounded bg-primary-foreground/20" />
        <div className="mt-3 h-4 w-full max-w-md rounded bg-primary-foreground/15" />
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="animate-pulse bg-card px-5 py-5 sm:px-6">
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="mt-5 h-8 w-14 rounded bg-muted" />
            <div className="mt-3 h-3 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSummaryPanel({ summary }: { summary: DashboardSummary }) {
  const attentionTotal = summary.attentionItems.reduce((total, item) => {
    const value = Number.parseInt(item.value, 10);
    return total + (Number.isNaN(value) ? 0 : value);
  }, 0);
  const primaryAction: DashboardAttentionItem | DashboardQuickAction | undefined =
    summary.attentionItems.length > 0
      ? summary.attentionItems[0]
      : summary.quickActions[0];

  return (
    <div className="flex-1 space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-primary px-5 py-7 text-primary-foreground shadow-[0_18px_45px_rgba(77,25,28,0.16)] sm:px-8 sm:py-9">
        <span className="absolute inset-x-0 top-0 h-px bg-[#f2b705]" aria-hidden="true" />
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-sm text-primary-foreground/70">
              <span>{summary.roleLabel} workspace</span>
              <span aria-hidden="true">•</span>
              <span>Refreshes automatically</span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
              {summary.title}
            </h2>
            <p className="mt-3 max-w-[65ch] text-base leading-7 text-primary-foreground/78">
              {summary.subtitle}
            </p>
            <p className="mt-5 text-sm font-semibold text-[#f2b705]">
              {attentionTotal > 0
                ? `${attentionTotal} active ${attentionTotal === 1 ? "item" : "items"} highlighted across your workspace.`
                : "No urgent work is currently recorded."}
            </p>
          </div>

          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="group inline-flex w-fit items-center gap-3 rounded-full bg-primary-foreground px-5 py-3 text-sm font-semibold text-primary outline-none transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[#f2b705] focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
            >
              {"title" in primaryAction ? primaryAction.title : primaryAction.label}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          ) : null}
        </div>
      </section>

      {summary.cards.length === 0 ? (
        <DashboardEmptyState roleLabel={summary.roleLabel} />
      ) : (
        <>
          <div
            className={cn(
              "grid items-start gap-6",
              summary.journey
                ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]"
                : "xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]",
            )}
          >
            <AttentionPanel items={summary.attentionItems} />
            {summary.journey ? (
              <JourneyPanel journey={summary.journey} />
            ) : (
              <ContinueWorkPanel actions={summary.quickActions} />
            )}
          </div>

          {summary.journey ? (
            <ContinueWorkPanel actions={summary.quickActions} />
          ) : null}

          <section aria-labelledby="dashboard-at-a-glance" className="space-y-3">
            <div>
              <h3
                id="dashboard-at-a-glance"
                className="text-xl font-semibold tracking-[-0.02em]"
              >
                At a glance
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Supporting figures from your current PGSMS records.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
              {summary.cards.map((card) => (
                <DashboardKpi key={card.id} card={card} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
