import { describe, expect, it } from "vitest";

import {
  buildTargetFingerprint,
  evaluateMigrationDeployment,
} from "../../scripts/lib/migration-deployment-guard.mjs";

const blockedMigrations = [
  { name: "20260101000000_first", sha256: "a".repeat(64) },
  { name: "20260102000000_second", sha256: "b".repeat(64) },
];
const targetFingerprint = "f".repeat(64);

function validApproval() {
  return {
    version: 1,
    databaseName: "pgsms",
    schemaName: "public",
    targetFingerprint,
    approvedBy: "Release owner",
    approvedAt: "2026-09-24T00:00:00.000Z",
    expiresAt: "2026-09-27T00:00:00.000Z",
    backupId: "backup-2026-09-24-001",
    rehearsalEvidence: "OPS-REHEARSAL-2026-09-24",
    migrations: blockedMigrations,
  };
}

function evaluate(overrides = {}) {
  return evaluateMigrationDeployment({
    appliedMigrationNames: [],
    approval: null,
    blockedMigrations,
    databaseName: "pgsms",
    now: new Date("2026-09-25T00:00:00.000Z"),
    schemaName: "public",
    targetFingerprint,
    userTableCount: 3,
    ...overrides,
  });
}

describe("migration deployment guard", () => {
  it("derives the target fingerprint without depending on credentials", () => {
    expect(
      buildTargetFingerprint(
        "postgresql://first:secret@db.example.test:6543/ignored",
        "pgsms",
        "public",
      ),
    ).toBe(
      buildTargetFingerprint(
        "postgresql://second:different@db.example.test:6543/ignored",
        "pgsms",
        "public",
      ),
    );
  });

  it("allows a genuinely empty target so disposable CI databases remain usable", () => {
    expect(evaluate({ userTableCount: 0 })).toMatchObject({
      allowed: true,
      reason: "empty-target",
    });
  });

  it("blocks a populated target when a reviewed migration is still pending", () => {
    expect(evaluate()).toMatchObject({
      allowed: false,
      reason: "approval-required",
    });
  });

  it("allows a populated target only with an exact target-specific approval", () => {
    expect(evaluate({ approval: validApproval() })).toMatchObject({
      allowed: true,
      reason: "approved-populated-target",
    });
  });

  it("rejects expired, wrong-target, and incomplete approvals", () => {
    expect(
      evaluate({
        approval: { ...validApproval(), expiresAt: "2026-09-25T00:00:00.000Z" },
      }),
    ).toMatchObject({ allowed: false, reason: "invalid-approval" });
    expect(
      evaluate({ approval: { ...validApproval(), databaseName: "another-db" } }),
    ).toMatchObject({ allowed: false, reason: "invalid-approval" });
    expect(
      evaluate({
        approval: { ...validApproval(), targetFingerprint: "e".repeat(64) },
      }),
    ).toMatchObject({ allowed: false, reason: "invalid-approval" });
    expect(
      evaluate({ approval: { ...validApproval(), migrations: blockedMigrations.slice(0, 1) } }),
    ).toMatchObject({ allowed: false, reason: "invalid-approval" });
  });

  it("rejects approval windows longer than seven days", () => {
    expect(
      evaluate({
        approval: { ...validApproval(), expiresAt: "2026-10-02T00:00:00.001Z" },
      }),
    ).toMatchObject({ allowed: false, reason: "invalid-approval" });
  });

  it("rejects an approval if any reviewed checksum differs", () => {
    const approval = validApproval();
    approval.migrations = [
      approval.migrations[0],
      { ...approval.migrations[1], sha256: "c".repeat(64) },
    ];

    expect(evaluate({ approval })).toMatchObject({
      allowed: false,
      reason: "invalid-approval",
    });
  });
});
