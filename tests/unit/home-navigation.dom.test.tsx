/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeNavigation } from "@/components/layout/home-navigation";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt || "PGSMS"} />,
}));

const sections = [
  ["Programmes", "programmes"],
  ["Research", "research"],
  ["Student Journey", "student-journey"],
] as const;

function renderNavigation() {
  render(
    <>
      <HomeNavigation />
      {sections.map(([, id]) => <section id={id} key={id} />)}
    </>,
  );
}

describe("HomeNavigation", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    cleanup();
    scrollIntoView.mockReset();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it.each(sections)("scrolls the desktop %s link to #%s without navigating away", async (label, id) => {
    renderNavigation();

    await userEvent.click(screen.getByRole("link", { name: label }));

    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe(`#${id}`);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it("closes the mobile menu after navigating to a section", async () => {
    renderNavigation();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const mobileMenu = document.getElementById("home-mobile-navigation");
    expect(mobileMenu).not.toBeNull();

    await user.click(within(mobileMenu!).getByRole("link", { name: "Research" }));

    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#research");
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("places the gold and maroon ribbons below the navigation", () => {
    renderNavigation();

    expect(
      Array.from(document.querySelectorAll('[data-brand-ribbons="header"] [data-ribbon-color]')).map(
        (ribbon) => ribbon.getAttribute("data-ribbon-color"),
      ),
    ).toEqual(["gold", "maroon"]);
  });
});
