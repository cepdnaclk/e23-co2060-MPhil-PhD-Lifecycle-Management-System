import { describe, expect, it } from "vitest";

import { validateLifecycleDatabaseUrl } from "../../scripts/run-lifecycle-e2e.mjs";

describe("lifecycle E2E database guard", () => {
  it("accepts only the exact dedicated local database", () => {
    expect(
      validateLifecycleDatabaseUrl(
        "postgresql://pglms@127.0.0.1:55432/pglms_e2e_test?schema=public",
      ),
    ).toContain("pglms_e2e_test");
  });

  it("rejects a remote database", () => {
    expect(() =>
      validateLifecycleDatabaseUrl(
        "postgresql://pglms:secret@example.supabase.com/postgres",
      ),
    ).toThrow("refuses remote databases");
  });

  it("rejects a broader local database name", () => {
    expect(() =>
      validateLifecycleDatabaseUrl(
        "postgresql://pglms@127.0.0.1:55432/pglms_dev",
      ),
    ).toThrow("exact database name pglms_e2e_test");
  });
});
