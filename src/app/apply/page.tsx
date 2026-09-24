import { ApplicationForm } from "@/components/application/application-form";
import { PublicPageShell } from "@/components/layout/public-page-shell";

export default function ApplyPage() {
  return (
    <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
      <main className="flex-1 bg-background">
        <ApplicationForm />
      </main>
    </PublicPageShell>
  );
}
