"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";

import {
  getUserIdTokenResult,
  signInWithEmailPassword,
  signOutUser,
} from "@/lib/firebase/client";
import { sanitizedEmail, securePassword } from "@/lib/validation/schemas";
import { isAppUserRole, type AppUserRole } from "@/types/auth";

const loginSchema = z.object({
  email: sanitizedEmail,
  password: securePassword,
});

const roleRedirectMap: Record<AppUserRole, string> = {
  STUDENT: "/dashboard/student",
  SUPERVISOR: "/dashboard/supervisor",
  EXAMINER: "/dashboard/examiner",
  ADMINISTRATOR: "/dashboard/admin",
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeoutMessage = useMemo(() => {
    return searchParams.get("reason") === "timeout"
      ? "Session Timedout"
      : null;
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const parsedCredentials = loginSchema.safeParse({
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
      };

      if (!sessionResponse.ok) {
        await signOutUser();
        setErrorMessage(
          sessionPayload.error ??
            "Unable to create a secure session. Please try again.",
        );
        return;
      }

      router.push(resolveDashboardPathFromRole(roleClaim));
      router.refresh();
    } catch (error) {
      setErrorMessage(mapFirebaseErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {timeoutMessage ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {timeoutMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
          placeholder="name@eng.pdn.ac.lk"
          data-testid="login-email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-200" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
          placeholder="Enter your password"
          data-testid="login-password"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
        data-testid="login-submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
