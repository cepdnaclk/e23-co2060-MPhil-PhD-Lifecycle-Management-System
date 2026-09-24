import React from "react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  className?: string;
  colorClass?: string;
  accentColorClass?: string;
}

export function Loader({
  className,
  colorClass = "border-primary",
  accentColorClass = "border-[#ffb606]",
}: LoaderProps) {
  return (
    <div className={cn("relative h-[60px] w-[60px]", className)} data-loader>
      <div
        className={cn("absolute h-[55px] w-[55px] rounded-full border-[5px]", colorClass)}
        data-loader-ring
        style={{ animation: "custom-load-1 1s linear infinite", borderLeftColor: "transparent" }}
      />
      <div
        className={cn(
          "absolute m-[7.5px] h-[40px] w-[40px] rounded-full border-[5px]",
          accentColorClass,
        )}
        data-loader-ring
        style={{
          animation: "custom-load-2 1.5s linear infinite",
          borderRightColor: "transparent",
          borderTopColor: "transparent",
        }}
      />
    </div>
  );
}
