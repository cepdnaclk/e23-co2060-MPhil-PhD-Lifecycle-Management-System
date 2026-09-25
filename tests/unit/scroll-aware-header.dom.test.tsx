/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrollAwareHeader } from "@/components/layout/scroll-aware-header";

describe("ScrollAwareHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides while scrolling down and returns as soon as scrolling reverses", () => {
    let scrollY = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });

    render(<ScrollAwareHeader>Dashboard controls</ScrollAwareHeader>);
    const header = screen.getByText("Dashboard controls").closest("header");

    expect(header).toHaveAttribute("data-visible", "true");

    act(() => {
      scrollY = 120;
      fireEvent.scroll(window);
    });
    expect(header).toHaveAttribute("data-visible", "false");

    act(() => {
      scrollY = 116;
      fireEvent.scroll(window);
    });
    expect(header).toHaveAttribute("data-visible", "true");
  });
});
