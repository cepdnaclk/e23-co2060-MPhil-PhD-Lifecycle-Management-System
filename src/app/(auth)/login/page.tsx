import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-50">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/90 shadow-[0_40px_120px_rgba(2,6,23,0.45)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.22),_transparent_42%),linear-gradient(160deg,_#082f49_0%,_#0f172a_55%,_#020617_100%)] px-8 py-10 sm:px-12 sm:py-14">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-sky-300/25 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
              PGSMS Access
            </span>
            <h1 className="max-w-lg text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Sign in to continue your postgraduate lifecycle workflow.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-200">
              Access is routed by role after authentication, so students, supervisors,
              examiners, and administrators land directly in the right dashboard.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-slate-100">Secure sessions</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Session cookies are server-managed and expire after 30 minutes of inactivity.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-slate-100">Role-aware access</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Custom Firebase claims determine the correct dashboard and protected routes.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center bg-slate-950 px-8 py-10 sm:px-12 sm:py-14">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Welcome back</h2>
              <p className="text-sm leading-6 text-slate-400">
                Use your assigned institutional account to sign in.
              </p>
            </div>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
