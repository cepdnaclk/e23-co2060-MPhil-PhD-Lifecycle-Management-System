import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  EXTERNAL_TEST_ROLES,
  loadExternalTestAccounts,
  signInAs,
  type ExternalTestRole,
} from "./support/external-test-accounts";

const externalAccounts = loadExternalTestAccounts();

const REPRESENTATIVE_ROLE_ROUTES: Record<ExternalTestRole, string> = {
  HOD: "/dashboard/hod/applications",
  ADMINISTRATOR: "/dashboard/admin/progress",
  SUPERVISOR: "/dashboard/supervisor/applications",
  EXAMINER: "/dashboard/examiner/proposals",
  STUDENT: "/dashboard/student/progress-reports",
};

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

async function expectAccessibleDashboard(page: Page) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Skip to dashboard content" }),
  ).toHaveCount(1);

  const movingElements = await page
    .locator("[data-dashboard-shell] *")
    .evaluateAll((elements) => {
      function hasPositiveDuration(value: string) {
        return value.split(",").some((duration) => {
          const normalized = duration.trim();
          const amount = Number.parseFloat(normalized);
          return Number.isFinite(amount) && amount > 0;
        });
      }

      return elements
        .filter((element) => {
          const styles = window.getComputedStyle(element);
          return (
            hasPositiveDuration(styles.animationDuration) ||
            hasPositiveDuration(styles.transitionDuration)
          );
        })
        .map((element) => element.tagName.toLowerCase());
    });

  expect(movingElements).toEqual([]);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blockingViolations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(blockingViolations).toEqual([]);
}

test.describe(
  "authenticated dashboard accessibility",
  { tag: "@external" },
  () => {
    test.skip(
      !externalAccounts,
      "Set PGLMS_E2E_CREDENTIALS_FILE before running external browser tests.",
    );

    for (const role of EXTERNAL_TEST_ROLES) {
      test(`${role} overview and representative route meet the accessibility gate`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await signInAs(page, externalAccounts!, role);

        expect(
          await page.evaluate(() =>
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          ),
        ).toBe(true);
        await expectAccessibleDashboard(page);

        await page.goto(REPRESENTATIVE_ROLE_ROUTES[role]);
        await expect(page).toHaveURL(REPRESENTATIVE_ROLE_ROUTES[role]);
        await expectAccessibleDashboard(page);
      });
    }

    test("student can skip directly to dashboard content with the keyboard", async ({
      page,
    }) => {
      await signInAs(page, externalAccounts!, "STUDENT");
      await page.reload();

      const skipLink = page.getByRole("link", {
        name: "Skip to dashboard content",
      });
      const main = page.getByRole("main");

      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(main).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", { name: "Toggle Sidebar" }),
      ).toBeFocused();
    });
  },
);
