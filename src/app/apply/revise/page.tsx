import { ProposalRevisionForm } from "@/components/applications/proposal-revision-form";

export default async function ProposalRevisionPage({
  searchParams,
}: {
  searchParams: Promise<{
    applicationId?: string;
    token?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-12">
      <ProposalRevisionForm
        applicationId={params.applicationId ?? ""}
        revisionToken={params.token ?? ""}
      />
    </main>
  );
}
