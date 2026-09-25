import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PLACEHOLDER_PATTERN = /(?:change[-_ ]?me|example|placeholder|todo)/i;
const MAXIMUM_APPROVAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildTargetFingerprint(databaseUrl, databaseName, schemaName) {
  const parsed = new URL(databaseUrl);
  const port = parsed.port || "5432";
  return sha256(
    `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${port}/${databaseName}/${schemaName}`,
  );
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Migration approval field ${field} must be a non-empty string.`);
  }

  const normalized = value.trim();
  if (PLACEHOLDER_PATTERN.test(normalized)) {
    throw new Error(`Migration approval field ${field} still contains a placeholder.`);
  }
  return normalized;
}

function requireDate(value, field) {
  const text = requireText(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Migration approval field ${field} must be an ISO date.`);
  }
  return date;
}

export function readApprovalFile(filePath) {
  if (!filePath) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read migration approval file: ${error instanceof Error ? error.message : "invalid file"}`,
    );
  }

  return parsed;
}

export function evaluateMigrationDeployment({
  appliedMigrationNames,
  approval,
  blockedMigrations,
  databaseName,
  now = new Date(),
  schemaName,
  targetFingerprint,
  userTableCount,
}) {
  const applied = new Set(appliedMigrationNames);
  const pendingBlocked = blockedMigrations.filter(
    (migration) => !applied.has(migration.name),
  );

  if (pendingBlocked.length === 0) {
    return { allowed: true, pendingBlocked, reason: "no-blocked-migrations" };
  }

  const targetIsEmpty = userTableCount === 0 && applied.size === 0;
  if (targetIsEmpty) {
    return { allowed: true, pendingBlocked, reason: "empty-target" };
  }

  if (!approval) {
    return {
      allowed: false,
      pendingBlocked,
      reason: "approval-required",
      message:
        "The target is populated and has pending production-blocked migrations. Set PGSMS_MIGRATION_APPROVAL_FILE to a reviewed target-specific approval artifact.",
    };
  }

  try {
    if (approval.version !== 1) {
      throw new Error("Migration approval version must be 1.");
    }

    const approvedDatabase = requireText(approval.databaseName, "databaseName");
    const approvedSchema = requireText(approval.schemaName, "schemaName");
    const approvedFingerprint = requireText(
      approval.targetFingerprint,
      "targetFingerprint",
    );
    requireText(approval.approvedBy, "approvedBy");
    requireText(approval.backupId, "backupId");
    requireText(approval.rehearsalEvidence, "rehearsalEvidence");
    const approvedAt = requireDate(approval.approvedAt, "approvedAt");
    const expiresAt = requireDate(approval.expiresAt, "expiresAt");

    if (approvedDatabase !== databaseName || approvedSchema !== schemaName) {
      throw new Error(
        `Approval targets ${approvedDatabase}/${approvedSchema}, not ${databaseName}/${schemaName}.`,
      );
    }
    if (approvedFingerprint !== targetFingerprint) {
      throw new Error("Approval target fingerprint does not match this database endpoint.");
    }
    if (approvedAt.getTime() > now.getTime()) {
      throw new Error("Migration approval date is in the future.");
    }
    if (expiresAt.getTime() <= now.getTime()) {
      throw new Error("Migration approval has expired.");
    }
    if (expiresAt.getTime() - approvedAt.getTime() > MAXIMUM_APPROVAL_WINDOW_MS) {
      throw new Error("Migration approval window cannot exceed seven days.");
    }
    if (!Array.isArray(approval.migrations)) {
      throw new Error("Migration approval migrations must be an array.");
    }

    const approvedMigrations = new Map(
      approval.migrations.map((migration, index) => [
        requireText(migration?.name, `migrations[${index}].name`),
        requireText(migration?.sha256, `migrations[${index}].sha256`),
      ]),
    );
    if (approvedMigrations.size !== approval.migrations.length) {
      throw new Error("Migration approval contains duplicate migration names.");
    }

    const pendingNames = new Set(pendingBlocked.map((migration) => migration.name));
    if (
      approvedMigrations.size !== pendingBlocked.length ||
      [...approvedMigrations].some(([name]) => !pendingNames.has(name))
    ) {
      throw new Error(
        "Migration approval must list exactly the pending production-blocked migrations.",
      );
    }

    for (const migration of pendingBlocked) {
      if (approvedMigrations.get(migration.name) !== migration.sha256) {
        throw new Error(
          `Migration approval checksum does not match ${migration.name}.`,
        );
      }
    }
  } catch (error) {
    return {
      allowed: false,
      pendingBlocked,
      reason: "invalid-approval",
      message: error instanceof Error ? error.message : "Invalid migration approval.",
    };
  }

  return { allowed: true, pendingBlocked, reason: "approved-populated-target" };
}
