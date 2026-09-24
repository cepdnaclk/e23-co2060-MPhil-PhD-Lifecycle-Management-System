import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PublicPageShell } from "@/components/layout/public-page-shell";
import { Button } from "@/components/ui/button";

export default async function ApplicationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; submittedAt?: string }>;
}) {
  const { reference, submittedAt } = await searchParams;
  const receiptTime =
    submittedAt && !Number.isNaN(new Date(submittedAt).getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(submittedAt))
      : null;

  return (
    <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/90 bg-card p-6 text-card-foreground sm:p-8">
          <header className="border-b border-border pb-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-6 text-sm font-semibold text-primary">Postgraduate application</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-foreground">
              Application submitted
            </h1>
            <p className="mt-3 max-w-xl leading-6 text-muted-foreground">
              Your application and supporting documents were received for postgraduate admissions
              review.
            </p>
          </header>

          <section
            aria-labelledby="receipt-heading"
            className="mt-6 rounded-lg border border-border bg-muted/30 p-4"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 id="receipt-heading" className="font-semibold">
                  Submission receipt
                </h2>
                {reference ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Reference: <span className="font-medium text-foreground">{reference}</span>
                  </p>
                ) : null}
                {receiptTime ? (
                  <p className="mt-1 text-sm text-muted-foreground">Received {receiptTime}</p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {reference
                    ? "Keep this reference for any follow-up about your submission."
                    : "Your submission was received successfully."}
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="next-steps-heading" className="mt-6">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="next-steps-heading" className="font-semibold">
                What happens next
              </h2>
            </div>
            <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <p className="pt-0.5 leading-5">
                  <span className="font-semibold text-foreground">Supervisor consent:</span> the
                  proposed supervisor is asked to review the request.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <p className="pt-0.5 leading-5">
                  <span className="font-semibold text-foreground">Department review:</span> eligible
                  applications move through academic review.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <p className="pt-0.5 leading-5">
                  <span className="font-semibold text-foreground">Decision:</span> the Department
                  records the application outcome before any admission is executed.
                </p>
              </li>
            </ol>
          </section>

          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/">Return to home</Link>
            </Button>
          </div>
        </div>
      </main>
    </PublicPageShell>
  );
}
