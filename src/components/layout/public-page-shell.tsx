import type { ReactNode } from "react";

import { PublicPageNavigation } from "@/components/layout/public-page-navigation";
import { SimpleSiteFooter } from "@/components/layout/simple-site-footer";

export function PublicPageShell({
  children,
  primaryHref,
  primaryLabel,
}: {
  children: ReactNode;
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background pt-20">
      <PublicPageNavigation primaryHref={primaryHref} primaryLabel={primaryLabel} />
      {children}
      <SimpleSiteFooter className="mt-auto" />
    </div>
  );
}
