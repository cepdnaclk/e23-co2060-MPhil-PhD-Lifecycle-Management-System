import { test, expect } from "@playwright/test";

test("student can reach Submit Progress Report in three clicks or less", async ({
  page,
}) => {
  await page.goto("/dashboard/student");

  await expect(
    page.getByRole("link", { name: "Submit Progress Report" }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Submit Progress Report" }).first().click();

  await expect(page).toHaveURL(/\/dashboard\/student\/progress-reports\/submit$/);
});
