import { describe, expect, it } from "vitest";

import {
  EXTERNAL_TEST_ROLES,
  parseExternalTestAccounts,
} from "../e2e/support/external-test-accounts";

const representativeAccounts = EXTERNAL_TEST_ROLES.map(
  (role) => `${role}: ${role.toLowerCase()}@example.invalid`,
);

describe("external E2E credential parsing", () => {
  it("parses one representative account per Department V1 role", () => {
    const accounts = parseExternalTestAccounts(
      [
        "PGLMS TEST ACCOUNTS",
        "Shared password: synthetic-test-value",
        ...representativeAccounts,
      ].join("\n"),
    );

    expect(accounts.HOD.email).toBe("hod@example.invalid");
    expect(accounts.ADMINISTRATOR.email).toBe(
      "administrator@example.invalid",
    );
    expect(accounts.STUDENT.password).toBe("synthetic-test-value");
  });

  it("fails closed when a role is absent", () => {
    expect(() =>
      parseExternalTestAccounts(
        [
          "Shared password: synthetic-test-value",
          ...representativeAccounts.filter(
            (line) => !line.startsWith("EXAMINER:"),
          ),
        ].join("\n"),
      ),
    ).toThrow("no EXAMINER account");
  });

  it("fails closed when no password is configured", () => {
    expect(() =>
      parseExternalTestAccounts(representativeAccounts.join("\n")),
    ).toThrow("no shared password");
  });
});
