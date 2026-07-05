import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, AlertTriangle, CheckCircle2, Info, Circle } from "lucide-react";

import type {
  DashboardKpiCard,
  DashboardQuickAction,
  DashboardStatusTone,
  DashboardSummary,
} from "@/types/dashboard";

export function getStatusIcon(tone: DashboardStatusTone) {
  switch (tone) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    case "warning":
    case "danger":
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    case "info":
      return <Info className="h-4 w-4 text-muted-foreground" />;
    case "neutral":
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function DashboardKpi({ card }: { card: DashboardKpiCard }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {card.title}
        </CardTitle>
        {getStatusIcon(card.statusTone)}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{card.value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {card.description}
        </p>
      </CardContent>
    </Card>
  );
}

function QuickActionCard({ action }: { action: DashboardQuickAction }) {
  return (
    <Link href={action.href} className="block h-full transition-opacity hover:opacity-80">
      <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader>
          <CardTitle className="text-lg">{action.label}</CardTitle>
          <CardDescription>{action.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

export function DashboardEmptyState({ roleLabel }: { roleLabel: string }) {
  return (
    <div
      data-testid="dashboard-empty-state"
      className="flex h-[400px] shrink-0 items-center justify-center rounded-md border border-dashed"
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <h3 className="mt-4 text-lg font-semibold">Nothing to show yet</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
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
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="animate-pulse">
          <CardHeader className="space-y-0 pb-2">
            <div className="h-4 w-1/2 rounded bg-muted"></div>
          </CardHeader>
          <CardContent>
            <div className="h-8 w-12 rounded bg-muted mt-2"></div>
            <div className="h-3 w-3/4 rounded bg-muted mt-2"></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardSummaryPanel({ summary }: { summary: DashboardSummary }) {
  if (summary.cards.length === 0) {
    return <DashboardEmptyState roleLabel={summary.roleLabel} />;
  }

  return (
    <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{summary.title}</h2>
          <p className="text-muted-foreground">{summary.subtitle}</p>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summary.cards.map((card) => (
          <DashboardKpi key={card.id} card={card} />
        ))}
      </div>

      <Separator className="my-6" />

      <div>
        <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {summary.quickActions.map((action) => (
            <QuickActionCard key={action.id} action={action} />
          ))}
        </div>
      </div>
    </div>
  );
}
