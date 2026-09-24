"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { PublicPageShell } from "@/components/layout/public-page-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
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
    <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive-foreground">
            <AlertTriangle aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="mt-6 text-sm font-semibold text-primary">Something went wrong</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            This page could not be loaded.
          </h1>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">
            Your work has not been intentionally discarded. Try loading the page again, and contact support if the problem continues.
          </p>
          <Button onClick={reset} className="mt-8 h-11 px-6">
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </main>
    </PublicPageShell>
  );
}
