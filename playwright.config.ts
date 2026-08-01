import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";
const isLifecycle = process.env.PGLMS_E2E_LIFECYCLE === "true";
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const configuredPort = process.env.PLAYWRIGHT_PORT?.trim() || "3000";
const baseURL = configuredBaseUrl || `http://localhost:${configuredPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi && !isLifecycle ? 1 : 0,
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
        command: isCi
          ? `npm run start -- -p ${configuredPort}`
          : `npm run dev -- -p ${configuredPort}`,
        url: baseURL,
        reuseExistingServer: !isCi,
        timeout: 120_000,
      },
});
