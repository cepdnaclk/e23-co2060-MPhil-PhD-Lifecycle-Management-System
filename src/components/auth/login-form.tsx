"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { Loader } from "@/components/ui/loader";
import { loginCredentialsSchema } from "@/lib/auth/schemas";
import {
  getUserIdTokenResult,
  signInWithEmailPassword,
  signOutUser,
} from "@/lib/firebase/client";
import { isAppUserRole, type AppUserRole } from "@/types/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const roleRedirectMap: Record<AppUserRole, string> = {
  STUDENT: "/dashboard/student",
  SUPERVISOR: "/dashboard/supervisor",
  EXAMINER: "/dashboard/examiner",
  ADMINISTRATOR: "/dashboard/admin",
  HOD: "/dashboard/hod",
};

function mapFirebaseErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/user-not-found":
        return "No account was found for that email address.";
      case "auth/wrong-password":
        return "The password you entered is incorrect.";
      case "auth/invalid-credential":
        return "Your email or password is incorrect.";
      default:
        return "Unable to sign in right now. Please try again.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to sign in right now. Please try again.";
}

export function resolveDashboardPathFromRole(role: AppUserRole): string {
  return roleRedirectMap[role];
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const timeoutMessage = useMemo(() => {
    return searchParams.get("reason") === "timeout"
      ? "Your session timed out. Sign in again to continue."
      : null;
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const parsedCredentials = loginCredentialsSchema.safeParse({
      email,
      password,
    });

    if (!parsedCredentials.success) {
      setErrorMessage(parsedCredentials.error.issues[0]?.message ?? "Invalid login details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const credential = await signInWithEmailPassword(
        parsedCredentials.data.email,
        parsedCredentials.data.password,
      );
      const idToken = await credential.user.getIdToken();
      const tokenResult = await getUserIdTokenResult(credential.user, true);
      const roleClaim = tokenResult.claims.role;

      if (!isAppUserRole(roleClaim)) {
        await signOutUser();
        setErrorMessage("Your account is missing a valid role claim.");
        setIsSubmitting(false);
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken,
        }),
      });

      const sessionPayload = (await sessionResponse.json()) as {
        error?: string;
        role?: unknown;
      };

      if (!sessionResponse.ok) {
        await signOutUser();
        setErrorMessage(
          sessionPayload.error ??
            "Unable to create a secure session. Please try again.",
        );
        setIsSubmitting(false);
        return;
      }

      if (!isAppUserRole(sessionPayload.role)) {
        await signOutUser();
        setErrorMessage("The server did not return a valid account role.");
        setIsSubmitting(false);
        return;
      }

      router.push(resolveDashboardPathFromRole(sessionPayload.role));
      router.refresh();
    } catch (error) {
      setErrorMessage(mapFirebaseErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  if (isSubmitting) {
    return (
      <div className="fixed inset-0 z-[9999] flex min-h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-5 text-center">
          <Loader />
          <p className="font-medium text-muted-foreground">
            Signing in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-border/90">
      <div className="h-1 bg-primary" aria-hidden="true" />
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <Image
            src="/uni-logo.png"
            alt="University of Peradeniya"
            width={72}
            height={72}
            priority
            className="h-[4.5rem] w-[4.5rem] object-contain"
          />
          <div className="mt-5 space-y-2">
            <p className="text-sm font-semibold text-primary">
              University of Peradeniya
            </p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
              Sign in to PGLMS
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Faculty of Engineering
            </p>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            Use your assigned institutional account to sign in.
          </p>
        </div>
        <form
          className="space-y-5"
          method="post"
          onSubmit={handleSubmit}
          noValidate
          data-testid="login-form"
          data-hydrated={isHydrated ? "true" : "false"}
        >
          {timeoutMessage && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
              {timeoutMessage}
            </div>
          )}

          {errorMessage && (
            <div
              className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@eng.pdn.ac.lk"
              className="h-11 text-base md:text-base"
              data-testid="login-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
              <input
                id="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-full w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Enter your password"
                data-testid="login-password"
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((current) => !current)}
                className="shrink-0 rounded-md px-1 py-1 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                aria-pressed={isPasswordVisible}
              >
                {isPasswordVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 pt-3 sm:grid-cols-[auto_1fr]">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/")}
              disabled={isSubmitting}
              className="h-11 px-6"
            >
              Back
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !isHydrated}
              data-testid="login-submit"
              className="h-11 w-full px-8"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
