import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260726120000_add_logical_document_versions",
    "migration.sql",
  ),
  "utf8",
);

describe("logical document version migration", () => {
  it("backfills proposal and thesis versions and records ambiguous legacy rows", () => {
    expect(migration).toContain('INSERT INTO "proposal_versions"');
    expect(migration).toContain('INSERT INTO "thesis_versions"');
    expect(migration).toContain('INSERT INTO "document_migration_issues"');
  });

  it("enforces one current logical version per proposal and thesis", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "proposal_versions_one_current_per_proposal"/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "thesis_versions_one_current_per_thesis"/,
    );
    expect(migration).toMatch(/WHERE "isCurrent" = true/);
  });
});
