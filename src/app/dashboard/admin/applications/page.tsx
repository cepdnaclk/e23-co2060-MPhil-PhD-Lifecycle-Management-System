import { ApplicationListPanel } from "@/components/admin/application-list-panel";

export default function AdminApplicationsPage() {
  return (
    <main className="space-y-12">
      <div className="mx-auto max-w-6xl">
        <header className="border-b-2 border-gray-200 pb-10">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Administration
            </p>
            <h1 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              Review Applications
            </h1>
            <p className="max-w-2xl text-xl font-medium leading-relaxed text-black/80">
              Review newly submitted applications and route them through the intake workflow.
            </p>
          </div>
        </header>
        <ApplicationListPanel />
      </div>
    </main>
  );
}
