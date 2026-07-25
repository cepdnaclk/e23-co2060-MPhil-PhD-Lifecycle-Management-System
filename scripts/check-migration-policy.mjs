import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const migrationsDirectory = path.join(repositoryRoot, "prisma", "migrations");
const policyPath = path.join(repositoryRoot, "prisma", "migration-policy.json");

const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const knownRisks = policy.knownRisks ?? {};
const errors = [];
const warnings = [];
const reviewedRiskMigrations = new Set();

const destructivePatterns = [
  /^\s*delete\s+from\b/i,
  /^\s*truncate\b/i,
  /^\s*update\s+/i,
  /^\s*drop\s+(table|type|schema|database|index)\b/i,
  /^\s*alter\s+table\b[\s\S]*\bdrop\s+(column|constraint)\b/i,
  /^\s*alter\s+table\b[\s\S]*\balter\s+column\b[\s\S]*\btype\b/i,
];

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

for (const migrationName of readdirSync(migrationsDirectory, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  const migrationPath = path.join(
    migrationsDirectory,
    migrationName,
    "migration.sql",
  );

  if (!existsSync(migrationPath)) {
    continue;
  }

  const sql = readFileSync(migrationPath, "utf8");
  const destructiveStatements = stripSqlComments(sql)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) =>
      destructivePatterns.some((pattern) => pattern.test(statement)),
    );

  if (destructiveStatements.length === 0) {
    continue;
  }

  const risk = knownRisks[migrationName];
  if (!risk) {
    errors.push(
      `${migrationName} contains ${destructiveStatements.length} destructive statement(s) without a migration-policy review.`,
    );
    continue;
  }

  reviewedRiskMigrations.add(migrationName);

  const actualHash = sha256(sql);
  if (actualHash !== risk.sha256) {
    errors.push(
      `${migrationName} changed after review (expected ${risk.sha256}, found ${actualHash}).`,
    );
  }

  if (risk.productionDeploymentBlocked !== true) {
    errors.push(
      `${migrationName} must remain productionDeploymentBlocked until preservation and rollback evidence is approved.`,
    );
  }

  warnings.push(
    `${migrationName}: ${destructiveStatements.length} destructive statement(s); production deployment remains blocked.`,
  );
}

for (const migrationName of Object.keys(knownRisks)) {
  if (!reviewedRiskMigrations.has(migrationName)) {
    errors.push(
      `${migrationName} is listed in migration-policy.json but no matching reviewed destructive migration was found.`,
    );
  }
}

for (const warning of warnings) {
  console.warn(`WARNING: ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Migration policy check passed (${warnings.length} known production blocker(s)).`,
  );
}
