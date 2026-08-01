"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

type WorkflowFeedbackProps = {
  error?: string | null;
  success?: string | null;
  completedAt?: Date | string | null;
};

function formatReceiptTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkflowFeedback({ error, success, completedAt }: WorkflowFeedbackProps) {
  return (
    <>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-foreground"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">{success}</p>
            {completedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded {formatReceiptTime(completedAt)}. Keep this receipt while reviewing the affected record.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
