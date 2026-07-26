import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SAFE_DATABASE_NAME = /(?:^|[_-])(dev|development|local|sample|test)(?:$|[_-])/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve("prisma/build/index.js");

export function validateResetTarget(environment = process.env) {
  if (environment.NODE_ENV === "production") {
    throw new Error("Sample-data reset is disabled when NODE_ENV=production.");
  }

  if (environment.ALLOW_SAMPLE_DATA_RESET !== "true") {
    throw new Error(
      "Set ALLOW_SAMPLE_DATA_RESET=true only for an isolated local sample database.",
    );
  }

  const rawUrl = environment.DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const databaseUrl = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }

  if (!LOCAL_HOSTS.has(databaseUrl.hostname)) {
    throw new Error(
      "Sample-data reset refuses non-local database hosts. Use a disposable local PostgreSQL database.",
    );
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (!databaseName || !SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      "The local database name must clearly contain dev, development, local, sample, or test.",
    );
  }

  if (environment.RESET_SAMPLE_STORAGE === "true") {
    throw new Error(
      "Storage cleanup is intentionally unsupported; no bucket may be reset by this command.",
    );
  }

  return {
    hostname: databaseUrl.hostname,
    port: databaseUrl.port || "5432",
    databaseName,
  };
}

export function formatResetTarget(target) {
  return `${target.hostname}:${target.port}/${target.databaseName}`;
}

function runPrisma(args, environment) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    env: environment,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Prisma command failed with exit code ${result.status}.`);
  }
}

export function resetSampleDatabase(environment = process.env) {
  const target = validateResetTarget(environment);
  const seedEnvironment = {
    ...environment,
    PGLMS_SEED_SAMPLE_DATA: "true",
  };

  console.log(`Resetting isolated sample database: ${formatResetTarget(target)}`);
  console.log("Storage cleanup: skipped");
  runPrisma(["migrate", "reset", "--force", "--skip-seed"], seedEnvironment);
  runPrisma(["db", "seed"], seedEnvironment);
  console.log("Sample database reset and seed completed.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    resetSampleDatabase();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
