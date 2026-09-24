import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import { PublicPageShell } from "@/components/layout/public-page-shell";

export default function NotFound() {
  return (
    <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-primary">
            <SearchX aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="mt-6 text-sm font-semibold text-primary">Page not found</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            We could not find that page.
          </h1>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">
            The address may be incorrect, or the page may have moved. Return to the homepage and continue from there.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Return home
          </Link>
        </div>
      </main>
    </PublicPageShell>
  );
}
