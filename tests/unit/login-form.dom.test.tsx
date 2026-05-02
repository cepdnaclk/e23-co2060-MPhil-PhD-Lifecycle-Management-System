/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/firebase/client", () => ({
  signInWithEmailPassword: vi.fn(),
  getUserIdTokenResult: vi.fn(),
  signOutUser: vi.fn(),
}));

import { LoginForm } from "@/components/auth/login-form";
import {
  getUserIdTokenResult,
  signInWithEmailPassword,
  signOutUser,
} from "@/lib/firebase/client";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("redirects to the matching dashboard after a successful login", async () => {
    const user = userEvent.setup();
    const mockFirebaseUser = {
      getIdToken: vi.fn().mockResolvedValue("id-token-1"),
    };

    vi.mocked(signInWithEmailPassword).mockResolvedValue({
      user: mockFirebaseUser,
    } as never);
    vi.mocked(getUserIdTokenResult).mockResolvedValue({
      claims: { role: "STUDENT" },
    } as never);
    vi.mocked(global.fetch as never).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as never);

    render(<LoginForm />);

    await user.type(screen.getByTestId("login-email"), "student@example.com");
    await user.type(screen.getByTestId("login-password"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard/student");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a user-not-found message from Firebase", async () => {
    const user = userEvent.setup();

    vi.mocked(signInWithEmailPassword).mockRejectedValue({
      code: "auth/user-not-found",
    } as never);

    render(<LoginForm />);

    await user.type(screen.getByTestId("login-email"), "missing@example.com");
    await user.type(screen.getByTestId("login-password"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(
        screen.getByText("No account was found for that email address."),
      ).toBeInTheDocument();
    });
  });

  it("shows a wrong-password message from Firebase", async () => {
    const user = userEvent.setup();

    vi.mocked(signInWithEmailPassword).mockRejectedValue({
      code: "auth/wrong-password",
    } as never);

    render(<LoginForm />);

    await user.type(screen.getByTestId("login-email"), "student@example.com");
    await user.type(screen.getByTestId("login-password"), "wrongpass");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(
        screen.getByText("The password you entered is incorrect."),
      ).toBeInTheDocument();
    });
  });

  it("lets the user show and hide the typed password", async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    const passwordField = screen.getByTestId("login-password");

    expect(passwordField).toHaveAttribute("type", "password");

    await user.type(passwordField, "password123");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(passwordField).toHaveAttribute("type", "text");
    expect(passwordField).toHaveValue("password123");

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(passwordField).toHaveAttribute("type", "password");
  });

  it("blocks redirection for an inactive user account", async () => {
    const user = userEvent.setup();
    const mockFirebaseUser = {
      getIdToken: vi.fn().mockResolvedValue("id-token-2"),
    };

    vi.mocked(signInWithEmailPassword).mockResolvedValue({
      user: mockFirebaseUser,
    } as never);
    vi.mocked(getUserIdTokenResult).mockResolvedValue({
      claims: { role: "SUPERVISOR" },
    } as never);
    vi.mocked(global.fetch as never).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: "Your account is inactive. Please contact an administrator.",
      }),
    } as never);

    render(<LoginForm />);

    await user.type(screen.getByTestId("login-email"), "inactive@example.com");
    await user.type(screen.getByTestId("login-password"), "password123");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Your account is inactive. Please contact an administrator.",
        ),
      ).toBeInTheDocument();
    });

    expect(signOutUser).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
