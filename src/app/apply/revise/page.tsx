import { ProposalRevisionForm } from "@/components/applications/proposal-revision-form";
import { PublicPageShell } from "@/components/layout/public-page-shell";

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
    <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
      <main className="flex-1 bg-muted/20 px-4 py-12">
        <ProposalRevisionForm
          applicationId={params.applicationId ?? ""}
          revisionToken={params.token ?? ""}
        />
      </main>
    </PublicPageShell>
  );
}
