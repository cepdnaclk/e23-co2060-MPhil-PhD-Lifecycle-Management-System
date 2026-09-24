import { Skeleton } from "@/components/ui/skeleton";

export function DashboardPageLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading dashboard content" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-9 w-64 max-w-[75vw]" />
          <Skeleton className="h-4 w-[32rem] max-w-[82vw]" />
        </div>
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>

      <section className="space-y-3" aria-hidden="true">
        <Skeleton className="h-4 w-24" />
        <div className="grid overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="space-y-5 bg-card p-6" key={index}>
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-hidden="true">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72 max-w-[75vw]" />
        <div className="grid overflow-hidden rounded-2xl border bg-border lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div className="space-y-3 bg-card p-6" key={index}>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>

      <span className="sr-only">Loading dashboard content.</span>
    </div>
  );
}
