import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

export const EXTERNAL_TEST_ROLES = [
  "HOD",
  "ADMINISTRATOR",
  "SUPERVISOR",
  "EXAMINER",
  "STUDENT",
] as const;

export type ExternalTestRole = (typeof EXTERNAL_TEST_ROLES)[number];

type ExternalTestAccount = {
  email: string;
  password: string;
};

export type ExternalTestAccounts = Record<
  ExternalTestRole,
  ExternalTestAccount
>;

export const ROLE_DASHBOARD_PATHS: Record<ExternalTestRole, string> = {
  HOD: "/dashboard/hod",
  ADMINISTRATOR: "/dashboard/admin",
  SUPERVISOR: "/dashboard/supervisor",
  EXAMINER: "/dashboard/examiner",
  STUDENT: "/dashboard/student",
};

export const ROLE_DASHBOARD_HEADINGS: Record<ExternalTestRole, string> = {
  HOD: "Head of Department Dashboard",
  ADMINISTRATOR: "Administrator Dashboard",
  SUPERVISOR: "Supervisor Dashboard",
  EXAMINER: "Examiner Dashboard",
  STUDENT: "Student Dashboard",
};

function isInsideRepository(filePath: string) {
  const repositoryRelativePath = relative(process.cwd(), filePath);
  return (
    repositoryRelativePath === "" ||
    (!repositoryRelativePath.startsWith("..") &&
      !isAbsolute(repositoryRelativePath))
  );
}

export function parseExternalTestAccounts(
  contents: string,
): ExternalTestAccounts {
  const password = contents
    .split(/\r?\n/)
    .find((line) => line.startsWith("Shared password: "))
    ?.slice("Shared password: ".length)
    .trim();

  if (!password) {
    throw new Error("The external E2E credentials file has no shared password.");
  }

  const emailByRole = new Map<ExternalTestRole, string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^(HOD|ADMINISTRATOR|SUPERVISOR|EXAMINER|STUDENT):\s+(\S+@\S+)$/,
    );
    if (match) {
      emailByRole.set(match[1] as ExternalTestRole, match[2]);
    }
  }

  const accounts = {} as ExternalTestAccounts;
  for (const role of EXTERNAL_TEST_ROLES) {
    const email = emailByRole.get(role);
    if (!email) {
      throw new Error(
        `The external E2E credentials file has no ${role} account.`,
      );
    }
    accounts[role] = { email, password };
  }

  return accounts;
}

export function loadExternalTestAccounts():
  | ExternalTestAccounts
  | null {
  const configuredPath = process.env.PGLMS_E2E_CREDENTIALS_FILE?.trim();
  if (!configuredPath) return null;

  if (!isAbsolute(configuredPath)) {
    throw new Error("PGLMS_E2E_CREDENTIALS_FILE must be an absolute path.");
  }

  const credentialsPath = resolve(configuredPath);
  if (isInsideRepository(credentialsPath)) {
    throw new Error(
      "PGLMS_E2E_CREDENTIALS_FILE must point outside the repository.",
    );
  }
  if (!existsSync(credentialsPath)) {
    throw new Error("The configured external E2E credentials file is missing.");
  }

  return parseExternalTestAccounts(readFileSync(credentialsPath, "utf8"));
}

export async function signInAs(
  page: Page,
  accounts: ExternalTestAccounts,
  role: ExternalTestRole,
) {
  const account = accounts[role];
  const expectedPath = ROLE_DASHBOARD_PATHS[role];

  await page.goto("/login");

  const form = page.getByTestId("login-form");
  await expect(form).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("login-submit")).toBeEnabled();

  await page.getByTestId("login-email").fill(account.email);
  await page.getByTestId("login-password").fill(account.password);
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`), {
    timeout: 30_000,
  });
}
