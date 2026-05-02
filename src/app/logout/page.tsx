"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function performLogout() {
      try {
        await fetch("/api/auth/session", {
          method: "DELETE",
          credentials: "include",
        });
      } catch (error) {
        console.error("Logout failed:", error);
      } finally {
        // Always redirect to home even if API fails
        window.location.href = "/";
      }
    }

    void performLogout();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#e0e0e0]">
      <div className="text-center space-y-4">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-black border-t-transparent" />
        <p className="text-xl font-black uppercase tracking-widest text-black/40">
          Signing you out...
        </p>
      </div>
    </div>
  );
}
