/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicPageShell } from "@/components/layout/public-page-shell";

describe("PublicPageShell", () => {
  it("keeps public actions in the header and uses the compact footer", () => {
    render(
      <PublicPageShell primaryHref="/login" primaryLabel="Sign in">
        <main>Application content</main>
      </PublicPageShell>,
    );

    const navigation = screen.getByRole("navigation", { name: "Public page navigation" });

    expect(within(navigation).getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByText("Application content")).toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll('[data-brand-ribbons="header"] [data-ribbon-color]')).map(
        (ribbon) => ribbon.getAttribute("data-ribbon-color"),
      ),
    ).toEqual(["gold", "maroon"]);
    expect(document.querySelector('[data-brand-ribbons="footer"]')).not.toBeInTheDocument();
    expect(document.querySelector("[data-simple-site-footer]")).toBeInTheDocument();
  });
});
