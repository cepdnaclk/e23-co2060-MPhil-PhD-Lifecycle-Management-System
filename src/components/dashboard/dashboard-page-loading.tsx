import { Loader } from "@/components/ui/loader";

export function DashboardPageLoading() {
  return (
    <div
      data-dashboard-page-loading
      className="flex min-h-[clamp(24rem,62vh,38rem)] w-full items-center justify-center px-4 py-12"
      role="status"
      aria-label="Loading dashboard content"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <Loader />
        <p className="mt-5 text-lg font-semibold tracking-[-0.02em] text-foreground">
          Preparing your workspace
        </p>
        <p className="mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground">
          Loading the latest student and workflow information.
        </p>
      </div>
    </div>
  );
}
