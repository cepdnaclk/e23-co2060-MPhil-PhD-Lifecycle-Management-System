import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public application page has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/apply");

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
