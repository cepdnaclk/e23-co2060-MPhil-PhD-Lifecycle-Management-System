import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default async function ApplicationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; submittedAt?: string }>;
}) {
  const { reference, submittedAt } = await searchParams;
  const receiptTime = submittedAt && !Number.isNaN(new Date(submittedAt).getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(submittedAt))
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          Application submitted
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Your application and supporting documents were received for postgraduate admissions review.
        </p>

        <section aria-labelledby="receipt-heading" className="mt-6 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 id="receipt-heading" className="font-semibold">Submission receipt</h2>
              {reference ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Reference: <span className="font-medium text-foreground">{reference}</span>
                </p>
              ) : null}
              {receiptTime ? (
                <p className="mt-1 text-sm text-muted-foreground">Received {receiptTime}</p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                Keep this reference for any follow-up about your submission.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="next-steps-heading" className="mt-6">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="next-steps-heading" className="font-semibold">What happens next</h2>
          </div>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li><span className="font-medium text-foreground">1. Supervisor consent:</span> the proposed supervisor is asked to review the request.</li>
            <li><span className="font-medium text-foreground">2. Department review:</span> eligible applications move through academic review.</li>
            <li><span className="font-medium text-foreground">3. Decision:</span> the Department records the application outcome before any admission is executed.</li>
          </ol>
        </section>

        <div className="mt-8">
          <Link href="/" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Return to home
          </Link>
        </div>
      </div>
    </main>
  );
}
