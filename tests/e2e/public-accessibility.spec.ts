import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public application page has no serious or critical accessibility violations", async ({
  page,
}) => {
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
