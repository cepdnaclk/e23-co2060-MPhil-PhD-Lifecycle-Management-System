import { expect, test } from "@playwright/test";

import {
  EXTERNAL_TEST_ROLES,
  ROLE_DASHBOARD_HEADINGS,
  loadExternalTestAccounts,
  signInAs,
} from "./support/external-test-accounts";

const externalAccounts = loadExternalTestAccounts();

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

test.describe("authenticated Department V1 role shells", { tag: "@external" }, () => {
  test.skip(
    !externalAccounts,
    "Set PGLMS_E2E_CREDENTIALS_FILE before running external browser tests.",
  );

  for (const role of EXTERNAL_TEST_ROLES) {
    test(`${role} reaches only its role dashboard`, async ({ page }) => {
      await signInAs(page, externalAccounts!, role);

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: ROLE_DASHBOARD_HEADINGS[role],
        }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

      const sessionCookieName =
        process.env.SESSION_COOKIE_NAME?.trim() || "pglms_session";
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (cookie) => cookie.name === sessionCookieName,
      );

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.secure).toBe(true);
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.sameSite).toBe("Lax");
    });
  }
});
