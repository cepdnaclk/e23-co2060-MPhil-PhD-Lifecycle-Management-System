type DashboardPageProps = {
  params: {
    role: string;
  };
};

export default function DashboardRolePage({ params }: DashboardPageProps) {
  const isAdmin = params.role === "admin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-20 text-slate-50">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 px-8 py-10 text-center shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
        <p className="text-sm uppercase tracking-[0.18em] text-sky-300">
          Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold capitalize">
          {params.role} workspace
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">
          This role landing page confirms the authenticated redirect path for PB-010.
        </p>
        {isAdmin ? (
          <a
            href="/dashboard/admin/users"
            className="mt-6 inline-flex rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Open user management
          </a>
        ) : null}
      </div>
    </main>
  );
}
