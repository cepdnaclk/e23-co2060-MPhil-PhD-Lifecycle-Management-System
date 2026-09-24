"use client";

import Image from "next/image";
import React from "react";
import { Loader } from "@/components/ui/loader";

export function LoadingScreen({ message = "Loading PGSMS…" }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center text-center">
        <Image
          src="/uni-logo.png"
          alt=""
          width={64}
          height={64}
          className="mb-6 h-16 w-16 object-contain"
          priority
        />
        <Loader />
        <p className="mt-5 text-sm font-semibold text-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">Please wait a moment.</p>
      </div>
    </div>
  );
}
