import { cn } from "@/lib/utils";

export function SimpleSiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "border-t border-foreground/10 bg-background px-4 py-6 text-center text-xs text-muted-foreground",
        className,
      )}
      data-simple-site-footer
    >
      <p>© 2026 University of Peradeniya. All rights reserved.</p>
    </footer>
  );
}
