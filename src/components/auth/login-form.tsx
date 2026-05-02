"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { loginCredentialsSchema } from "@/lib/auth/schemas";
import {
  getUserIdTokenResult,
  signInWithEmailPassword,
  signOutUser,
} from "@/lib/firebase/client";
import { isAppUserRole, type AppUserRole } from "@/types/auth";

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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {timeoutMessage ? (
        <div className="rounded-2xl border border-red-500 bg-red-50 px-4 py-3 text-base font-medium text-red-700">
          {timeoutMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-2xl border border-red-500 bg-red-50 px-4 py-3 text-base font-medium text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-base font-bold text-black" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-gray-300 bg-gray-50/80 px-4 py-3 text-black outline-none transition focus:border-gray-300"
          placeholder="name@eng.pdn.ac.lk"
          data-testid="login-email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-base font-bold text-black" htmlFor="password">
          Password
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-gray-50/80 px-4 py-1.5 focus-within:border-gray-300">
          <input
            id="password"
            name="password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-transparent py-1.5 text-black outline-none"
            placeholder="Enter your password"
            data-testid="login-password"
          />
          <button
            type="button"
            onClick={() => setIsPasswordVisible((current) => !current)}
            className="shrink-0 text-sm font-semibold text-black transition hover:opacity-70"
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            aria-pressed={isPasswordVisible}
          >
            {isPasswordVisible ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          disabled={isSubmitting}
          className="theme-button theme-button--compact theme-button--black"
        >
          <span className="theme-button__label">Back</span>
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="theme-button"
          data-testid="login-submit"
        >
          <span className="theme-button__label">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </span>
        </button>
      </div>
    </form>
  );
}
