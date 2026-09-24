/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => <div data-testid="login-form-placeholder" />,
}));

import LoginPage from "@/app/(auth)/login/page";

describe("Login page shell", () => {
  it("places public navigation actions outside the sign-in form", () => {
    render(<LoginPage />);

    const navigation = screen.getByRole("navigation", { name: "Login page navigation" });

    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PGSMS home" })).toHaveAttribute("href", "/");
    expect(within(navigation).queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
    expect(within(navigation).getByRole("link", { name: "Apply now" })).toHaveAttribute("href", "/apply");
    expect(
      Array.from(document.querySelectorAll('[data-brand-ribbons="header"] [data-ribbon-color]')).map(
        (ribbon) => ribbon.getAttribute("data-ribbon-color"),
      ),
    ).toEqual(["gold", "maroon"]);
    expect(document.querySelector('[data-brand-ribbons="footer"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("login-form-placeholder")).toBeInTheDocument();
    expect(screen.getByText("© 2026 University of Peradeniya. All rights reserved.")).toBeInTheDocument();
  });
});
