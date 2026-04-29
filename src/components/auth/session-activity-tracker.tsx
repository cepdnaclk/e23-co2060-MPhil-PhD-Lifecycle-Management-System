"use client";

import { useEffect, useRef } from "react";

import { signOutUser } from "@/lib/firebase/client";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
] as const;

export function SessionActivityTracker() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
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
        await fetch("/api/auth/session", {
          method: "DELETE",
        });
      } catch {
        // Ignore network cleanup failures during timeout handling.
      }

      if (window.location.pathname !== "/login") {
        window.location.assign("/login?reason=timeout");
      }
    };

    const resetTimer = () => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        void expireSession();
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetTimer();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer);
    }

    return () => {
      clearTimer();

      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, []);

  return null;
}
