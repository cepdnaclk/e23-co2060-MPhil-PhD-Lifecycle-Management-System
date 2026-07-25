import { expect, test } from "@playwright/test";

test("public application form is reachable and exposes the submission flow", async ({
  page,
}) => {
  await page.route("**/api/applications/drafts", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        draftId: "d8e54622-7149-49e8-95d8-37d2d6206db5",
        draftToken: "test-only-public-draft-capability",
        expiresAt: "2026-07-27T00:00:00.000Z",
      }),
    });
  });
  await page.goto("/apply");

  await expect(
    page.getByRole("heading", { name: "Apply for your research programme" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.locator("form").getByText("Current step", { exact: true }),
  ).toBeVisible();
});
