"use client";

import useSWR from "swr";

import {
  DashboardSkeletonGrid,
  DashboardSummaryPanel,
} from "@/components/dashboard/dashboard-summary-panel";
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
        <div className="rounded-[1.75rem] border border-gray-300 bg-transparent px-5 py-4">
          <p className="text-base font-medium text-black">
            We could not refresh the latest dashboard metrics.
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 rounded-2xl border border-gray-300 px-4 py-2 text-base font-semibold text-black transition hover:border-gray-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return <DashboardSkeletonGrid />;
  }

  return <DashboardSummaryPanel summary={data ?? initialSummary} />;
}
