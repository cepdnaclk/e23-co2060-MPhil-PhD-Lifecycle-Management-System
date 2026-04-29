import { expect, test } from "@playwright/test";

test.describe("PB-010 login flow", () => {
  test("sets the session cookie and redirects to the role dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByTestId("login-email").fill("student@example.com");
    await page.getByTestId("login-password").fill("password123");
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/dashboard\/student$/);

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "pgsms_session");

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  test("shows the inactive-user message and prevents redirection", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByTestId("login-email").fill("inactive@example.com");
    await page.getByTestId("login-password").fill("password123");
    await page.getByTestId("login-submit").click();

    await expect(
      page.getByText("Your account is inactive. Please contact an administrator."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
