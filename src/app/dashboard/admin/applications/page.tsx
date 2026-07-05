import { ApplicationListPanel } from "@/components/admin/application-list-panel";

export default function AdminApplicationsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Review Applications</h2>
      </div>
      <ApplicationListPanel />
    </div>
  );
}
