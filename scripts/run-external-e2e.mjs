import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const configuredPath = process.env.PGLMS_E2E_CREDENTIALS_FILE?.trim();
if (!configuredPath) {
  console.error(
    "Set PGLMS_E2E_CREDENTIALS_FILE to the protected absolute credentials-file path.",
  );
  process.exit(1);
}
if (!isAbsolute(configuredPath)) {
  console.error("PGLMS_E2E_CREDENTIALS_FILE must be an absolute path.");
  process.exit(1);
}

const credentialsPath = resolve(configuredPath);
const repositoryRelativePath = relative(process.cwd(), credentialsPath);
if (
  repositoryRelativePath === "" ||
  (!repositoryRelativePath.startsWith("..") &&
    !isAbsolute(repositoryRelativePath))
) {
  console.error(
    "PGLMS_E2E_CREDENTIALS_FILE must point outside the repository.",
  );
  process.exit(1);
}
if (!existsSync(credentialsPath)) {
  console.error("The configured external E2E credentials file is missing.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "--grep",
    "@external",
    ...process.argv.slice(2),
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
