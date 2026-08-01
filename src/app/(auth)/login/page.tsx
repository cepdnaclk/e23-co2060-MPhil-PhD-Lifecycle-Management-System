import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Loading sign-in form...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
