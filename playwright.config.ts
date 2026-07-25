import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = configuredBaseUrl || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: isCi
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: configuredBaseUrl
    ? undefined
    : {
        command: isCi ? "npm run start" : "npm run dev",
        url: baseURL,
        reuseExistingServer: !isCi,
        timeout: 120_000,
      },
});
