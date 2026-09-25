import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public application page has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.route("**/api/public/supervisors", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ supervisors: [] }),
    });
  });
  const response = await page.goto("/apply");

  expect(response).not.toBeNull();
  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy-report-only"]).toContain(
    "frame-ancestors 'none'",
  );

  const results = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blockingViolations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(blockingViolations).toEqual([]);
});

test("login page exposes its public shell and remains accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  const navigation = page.getByRole("navigation", { name: "Login page navigation" });

  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  await expect(navigation.getByRole("link", { name: "Apply now" })).toHaveAttribute("href", "/apply");
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("© 2026 University of Peradeniya");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blockingViolations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(blockingViolations).toEqual([]);
});
