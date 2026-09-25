import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";

import {
  buildTargetFingerprint,
  evaluateMigrationDeployment,
  readApprovalFile,
  sha256,
} from "./lib/migration-deployment-guard.mjs";

const repositoryRoot = process.cwd();
const migrationsDirectory = path.join(repositoryRoot, "prisma", "migrations");
const policyPath = path.join(repositoryRoot, "prisma", "migration-policy.json");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(repositoryRoot);

function loadBlockedMigrations() {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  return Object.entries(policy.knownRisks ?? {})
    .filter(([, risk]) => risk.productionDeploymentBlocked === true)
    .map(([name, risk]) => {
      const migrationPath = path.join(migrationsDirectory, name, "migration.sql");
      if (!existsSync(migrationPath)) {
        throw new Error(`Blocked migration ${name} is missing migration.sql.`);
      }
      const actualSha256 = sha256(readFileSync(migrationPath, "utf8"));
      if (actualSha256 !== risk.sha256) {
        throw new Error(`Blocked migration ${name} no longer matches its reviewed checksum.`);
      }
      return { name, sha256: actualSha256 };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function inspectTarget(prisma) {
  const [identity] = await prisma.$queryRawUnsafe(
    "SELECT current_database() AS database_name, current_schema() AS schema_name",
  );
  const [tableSummary] = await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE table_name <> '_prisma_migrations')::integer AS user_table_count,
       COUNT(*) FILTER (WHERE table_name = '_prisma_migrations')::integer AS migration_table_count
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
  );

  let appliedMigrationNames = [];
  if (Number(tableSummary.migration_table_count) > 0) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    appliedMigrationNames = rows.map((row) => row.migration_name);
  }

  return {
    appliedMigrationNames,
    databaseName: identity.database_name,
    schemaName: identity.schema_name,
    userTableCount: Number(tableSummary.user_table_count),
  };
}

function listRepositoryMigrations() {
  return new Set(
    readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required before deploying migrations.");
  }

  const blockedMigrations = loadBlockedMigrations();
  const repositoryMigrations = listRepositoryMigrations();
  const prisma = new PrismaClient();
  let target;
  try {
    target = await inspectTarget(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const unknownApplied = target.appliedMigrationNames.filter(
    (name) => !repositoryMigrations.has(name),
  );
  if (unknownApplied.length > 0) {
    throw new Error(
      `Target migration ledger contains migrations absent from this release: ${unknownApplied.join(", ")}. Reconcile the ledger before deployment.`,
    );
  }

  const approval = readApprovalFile(process.env.PGSMS_MIGRATION_APPROVAL_FILE);
  const targetFingerprint = buildTargetFingerprint(
    process.env.DATABASE_URL,
    target.databaseName,
    target.schemaName,
  );
  const decision = evaluateMigrationDeployment({
    ...target,
    approval,
    blockedMigrations,
    targetFingerprint,
  });

  if (!decision.allowed) {
    const pending = decision.pendingBlocked.map((migration) => migration.name).join(", ");
    throw new Error(
      `${decision.message} Target fingerprint: ${targetFingerprint}. Pending blocked migrations: ${pending}`,
    );
  }

  console.log(
    `Migration deployment guard passed for ${target.databaseName}/${target.schemaName} (${decision.reason}).`,
  );
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(`Migration deployment refused: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
