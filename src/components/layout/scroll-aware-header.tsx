"use client";

import type { HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type ScrollAwareHeaderProps = HTMLAttributes<HTMLElement> & {
  pinned?: boolean;
};

export function ScrollAwareHeader({
  className,
  pinned = false,
  children,
  ...props
}: ScrollAwareHeaderProps) {
  const [isVisible, setIsVisible] = useState(true);
  const previousScrollY = useRef(0);

  useEffect(() => {
    if (pinned) {
      setIsVisible(true);
      return;
    }

    let frameId = 0;

    const updateVisibility = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const movement = currentScrollY - previousScrollY.current;

      if (currentScrollY <= 16 || movement < -2) {
        setIsVisible(true);
      } else if (currentScrollY > 88 && movement > 3) {
        setIsVisible(false);
      }

      previousScrollY.current = currentScrollY;
      frameId = 0;
    };

    const onScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateVisibility);
    };

    previousScrollY.current = Math.max(window.scrollY, 0);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [pinned]);

  return (
    <header
      data-scroll-aware-header
      data-visible={isVisible}
      className={cn(
        "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none",
        isVisible ? "translate-y-0" : "-translate-y-full",
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}
