"use client";

import type { MouseEvent } from "react";

export function HomeScrollToTop() {
  const scrollToTop = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  };

  return (
    <a href="#main-content" onClick={scrollToTop}>
      Back to top
    </a>
  );
}
