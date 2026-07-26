import { describe, expect, it } from "vitest";

import {
  formatResetTarget,
  validateResetTarget,
} from "../../scripts/reset-sample-database.mjs";

describe("sample database reset guard", () => {
  it("accepts an explicitly enabled disposable local database", () => {
    const target = validateResetTarget({
      NODE_ENV: "development",
      ALLOW_SAMPLE_DATA_RESET: "true",
      DATABASE_URL:
        "postgresql://sample_user:secret@127.0.0.1:5433/pglms_sample?schema=public",
    });

    expect(formatResetTarget(target)).toBe("127.0.0.1:5433/pglms_sample");
  });

  it.each([
    [
      "production mode",
      {
        NODE_ENV: "production",
        ALLOW_SAMPLE_DATA_RESET: "true",
        DATABASE_URL: "postgresql://user:secret@localhost/pglms_sample",
      },
    ],
    [
      "missing opt-in",
      {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://user:secret@localhost/pglms_sample",
      },
    ],
    [
      "a remote host",
      {
        NODE_ENV: "development",
        ALLOW_SAMPLE_DATA_RESET: "true",
        DATABASE_URL: "postgresql://user:secret@example.com/pglms_sample",
      },
    ],
    [
      "an ambiguous database name",
      {
        NODE_ENV: "development",
        ALLOW_SAMPLE_DATA_RESET: "true",
        DATABASE_URL: "postgresql://user:secret@localhost/postgres",
      },
    ],
    [
      "storage cleanup",
      {
        NODE_ENV: "development",
        ALLOW_SAMPLE_DATA_RESET: "true",
        RESET_SAMPLE_STORAGE: "true",
        DATABASE_URL: "postgresql://user:secret@localhost/pglms_sample",
      },
    ],
  ])("refuses %s", (_, environment) => {
    expect(() => validateResetTarget(environment)).toThrow();
  });

  it("never includes credentials in the displayed target", () => {
    const target = validateResetTarget({
      NODE_ENV: "test",
      ALLOW_SAMPLE_DATA_RESET: "true",
      DATABASE_URL:
        "postgresql://sample_user:super-secret@localhost/pglms_test",
    });

    expect(formatResetTarget(target)).not.toContain("sample_user");
    expect(formatResetTarget(target)).not.toContain("super-secret");
  });
});
