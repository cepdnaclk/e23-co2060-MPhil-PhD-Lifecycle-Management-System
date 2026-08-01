"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DecisionReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  subjectLabel: string;
  subject: string;
  decisionLabel?: string;
  decision: string;
  rationale?: string | null;
  consequences: string[];
  reversible: boolean;
  confirmLabel: string;
  pendingLabel?: string;
  isPending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
};

export function DecisionReviewDialog({
  open,
  onOpenChange,
  title,
  description,
  subjectLabel,
  subject,
  decisionLabel = "Decision",
  decision,
  rationale,
  consequences,
  reversible,
  confirmLabel,
  pendingLabel = "Recording...",
  isPending = false,
  destructive = false,
  onConfirm,
}: DecisionReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="font-medium text-muted-foreground">{subjectLabel}</dt>
          <dd className="font-semibold text-foreground">{subject}</dd>
          <dt className="font-medium text-muted-foreground">{decisionLabel}</dt>
          <dd className="text-foreground">{decision}</dd>
          {rationale ? (
            <>
              <dt className="font-medium text-muted-foreground">Rationale</dt>
              <dd className="whitespace-pre-wrap text-foreground">{rationale}</dd>
            </>
          ) : null}
        </dl>

        <section aria-labelledby="decision-effects-heading" className="space-y-2">
          <h3 id="decision-effects-heading" className="text-sm font-semibold">
            What happens next
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {consequences.map((consequence) => (
              <li key={consequence} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{consequence}</span>
              </li>
            ))}
          </ul>
        </section>

        <div
          className={
            reversible
              ? "rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground"
              : "flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground"
          }
        >
          {!reversible ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          <p>
            {reversible
              ? "This action can be changed later through the appropriate workflow."
              : "This action is not reversible from this screen. Confirm only after checking the record above."}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Go back
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
