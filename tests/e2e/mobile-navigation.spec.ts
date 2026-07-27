import { expect, test } from "@playwright/test";

import {
  loadExternalTestAccounts,
  signInAs,
} from "./support/external-test-accounts";

const externalAccounts = loadExternalTestAccounts();

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
  viewport: { width: 320, height: 800 },
});

test.describe("authenticated mobile dashboard navigation", { tag: "@external" }, () => {
  test.skip(
    !externalAccounts,
    "Set PGLMS_E2E_CREDENTIALS_FILE before running external browser tests.",
  );

  test("student can open the role navigation at 320px", async ({ page }) => {
    await signInAs(page, externalAccounts!, "STUDENT");

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();

    const mobileSidebar = page.locator(
      '[data-sidebar="sidebar"][data-mobile="true"]',
    );
    await expect(mobileSidebar).toBeVisible();
    await expect(
      mobileSidebar.getByRole("link", { name: "Overview" }),
    ).toBeVisible();
    await expect(
      mobileSidebar.getByRole("link", { name: "Progress Reports" }),
    ).toBeVisible();
  });
});
