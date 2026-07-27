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
});

test.describe("authenticated student dashboard", { tag: "@external" }, () => {
  test.skip(
    !externalAccounts,
    "Set PGLMS_E2E_CREDENTIALS_FILE before running external browser tests.",
  );

  test("student can reach fixed progress milestones in three clicks or less", async ({
    page,
  }) => {
    await signInAs(page, externalAccounts!, "STUDENT");

    await expect(
      page.getByRole("link", { name: "Open Progress Milestones" }).first(),
    ).toBeVisible();

    await page
      .getByRole("link", { name: "Open Progress Milestones" })
      .first()
      .click();

    await expect(page).toHaveURL(/\/dashboard\/student\/progress-reports$/);
  });
});
