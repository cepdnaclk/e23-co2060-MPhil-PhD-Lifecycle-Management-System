import { ApplicationListPanel } from "@/components/admin/application-list-panel";

export default function AdminApplicationsPage() {
  return (
    <main className="h-full overflow-y-auto rounded-[30px] border border-black bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(248,250,252,0.96)_100%)] px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-3xl font-bold text-black">Review Applications</h1>
        <ApplicationListPanel />
      </div>
    </main>
  );
}
