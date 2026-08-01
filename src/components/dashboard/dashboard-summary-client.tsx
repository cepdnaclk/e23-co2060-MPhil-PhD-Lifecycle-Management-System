"use client";

import useSWR from "swr";
import { RefreshCw } from "lucide-react";

import {
  DashboardSkeletonGrid,
  DashboardSummaryPanel,
} from "@/components/dashboard/dashboard-summary-panel";
import { Button } from "@/components/ui/button";
import type { DashboardRole, DashboardSummary } from "@/types/dashboard";

async function fetchDashboardSummary(url: string): Promise<DashboardSummary> {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load dashboard summary.");
  }

  const payload = (await response.json()) as {
    summary: DashboardSummary;
  };

  return payload.summary;
}

export function DashboardSummaryClient({
  role,
  initialSummary,
}: {
  role: DashboardRole;
  initialSummary: DashboardSummary;
}) {
  const { data, error, mutate, isLoading } = useSWR(
    `/api/dashboard/${role}/summary`,
    fetchDashboardSummary,
    {
      fallbackData: initialSummary,
      refreshInterval: 30000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  if (error) {
    return (
      <div className="space-y-4">
        <DashboardSkeletonGrid />
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-5 sm:px-6">
          <p className="font-semibold text-destructive-foreground">
            We could not refresh the latest dashboard metrics.
          </p>
          <p className="mt-1 text-sm text-destructive-foreground/80">
            Check your connection and try loading the latest data again.
          </p>
          <Button
            onClick={() => void mutate()}
            variant="outline"
            className="mt-4 border-destructive/30 bg-background text-destructive-foreground hover:bg-destructive/10"
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return <DashboardSkeletonGrid />;
  }

  return <DashboardSummaryPanel summary={data ?? initialSummary} />;
}
