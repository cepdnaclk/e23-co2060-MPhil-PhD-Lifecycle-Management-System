"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export function DashboardRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[28rem] items-center justify-center rounded-2xl border bg-card px-6 py-12 text-center">
      <div className="max-w-lg">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-foreground">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">
          This workspace could not be loaded.
        </h2>
        <p className="mt-2 leading-6 text-muted-foreground">
          Try loading this section again. Your saved records are not changed by retrying.
        </p>
        <Button onClick={reset} className="mt-6">
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
