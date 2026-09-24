"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { secureFetch } from "@/lib/security/client-request";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function performLogout() {
      try {
        await secureFetch("/api/auth/session", {
          method: "DELETE",
          credentials: "include",
        });
      } catch (error) {
        console.error("Logout failed:", error);
      } finally {
        // Always redirect to home even if API fails
        router.replace("/");
      }
    }

    void performLogout();
  }, [router]);

  return <LoadingScreen message="Signing you out…" />;
}
