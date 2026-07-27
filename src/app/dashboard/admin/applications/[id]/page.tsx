import { ApplicationReviewPanel } from "@/components/admin/application-review-panel";

export default async function AdminApplicationReviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <div className="h-full overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <ApplicationReviewPanel applicationId={params.id} />
      </div>
    </div>
  );
}
