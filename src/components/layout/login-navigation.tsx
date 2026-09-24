import { PublicPageNavigation } from "@/components/layout/public-page-navigation";

export function LoginNavigation() {
  return (
    <PublicPageNavigation
      ariaLabel="Login page navigation"
      primaryHref="/apply"
      primaryLabel="Apply now"
    />
  );
}
