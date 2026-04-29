export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-24 text-slate-50">
      <div className="max-w-2xl space-y-6 text-center">
        <span className="inline-flex rounded-full border border-slate-700 px-4 py-1 text-sm font-medium text-slate-300">
          PB-001 Foundation Ready
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Postgraduate lifecycle platform scaffolded for the next backlog items.
        </h1>
        <p className="text-base leading-7 text-slate-300 sm:text-lg">
          Next.js 14 App Router, strict TypeScript, Tailwind CSS, and the agreed
          project structure are in place for Prisma, Firebase, and role-based
          dashboards.
        </p>
      </div>
    </main>
  );
}
