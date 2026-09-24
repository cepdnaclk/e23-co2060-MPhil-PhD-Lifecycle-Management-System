/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeScrollToTop } from "@/components/layout/home-scroll-to-top";

describe("HomeScrollToTop", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("smoothly returns to the homepage top without navigating to another page", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    window.history.replaceState(null, "", "/?source=footer#research");
    render(<HomeScrollToTop />);

    await userEvent.click(screen.getByRole("link", { name: "Back to top" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?source=footer");
    expect(window.location.hash).toBe("");
  });
});
