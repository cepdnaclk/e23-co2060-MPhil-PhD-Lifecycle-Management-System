import { expect, test } from "@playwright/test";

test("public application form is reachable and exposes the submission flow", async ({
  page,
}) => {
  await page.goto("/apply");

  await expect(
    page.getByRole("heading", { name: "Apply for your research programme" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.locator("form").getByText("Current step", { exact: true }),
  ).toBeVisible();
});
