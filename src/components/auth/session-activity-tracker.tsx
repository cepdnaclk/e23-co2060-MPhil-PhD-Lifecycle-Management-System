"use client";

import { useEffect, useRef } from "react";

import { signOutUser } from "@/lib/firebase/client";
import { secureFetch } from "@/lib/security/client-request";
import {
  SESSION_INACTIVITY_TIMEOUT_MS,
  SESSION_REFRESH_THROTTLE_MS,
} from "@/lib/security/session";
const ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
] as const;

export function SessionActivityTracker() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.location.pathname.startsWith("/dashboard")) {
      return;
    }

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    const expireSession = async () => {
      try {
        await signOutUser();
      } catch {
        // Ignore client sign-out failures so cookie cleanup still runs.
      }

      try {
        await secureFetch("/api/auth/session", {
          method: "DELETE",
        });
      } catch {
        // Ignore network cleanup failures during timeout handling.
      }

      // Only force a redirect if the user is on a protected dashboard route
      if (window.location.pathname.startsWith("/dashboard")) {
        window.location.assign("/login?reason=timeout");
      }
    };

    const resetTimer = () => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        void expireSession();
      }, SESSION_INACTIVITY_TIMEOUT_MS);
    };

    const refreshServerSession = async () => {
      const now = Date.now();

      if (now - lastRefreshRef.current < SESSION_REFRESH_THROTTLE_MS) {
        return;
      }

      lastRefreshRef.current = now;

      try {
        const response = await secureFetch("/api/auth/session", {
          method: "PATCH",
          cache: "no-store",
        });

        if (response.status === 401) {
          await expireSession();
        }
      } catch {
        // Ignore refresh failures and rely on the inactivity timeout fallback.
      }
    };

    resetTimer();
    void refreshServerSession();
    const handleActivity = () => {
      resetTimer();
      void refreshServerSession();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }

    return () => {
      clearTimer();

      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, []);

  return null;
}
