import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const SAFE_DATABASE_NAME = "pglms_e2e_test";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function validateLifecycleDatabaseUrl(rawUrl) {
  if (!rawUrl?.trim()) {
    throw new Error(
      "Set PGLMS_E2E_DATABASE_URL to the dedicated local pglms_e2e_test database.",
    );
  }

  const databaseUrl = new URL(rawUrl.trim());
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("PGLMS_E2E_DATABASE_URL must use PostgreSQL.");
  }
  if (!LOCAL_HOSTS.has(databaseUrl.hostname)) {
    throw new Error(
      "Lifecycle E2E refuses remote databases. Use a disposable local PostgreSQL database.",
    );
  }

  const databaseName = decodeURIComponent(
    databaseUrl.pathname.replace(/^\/+/, ""),
  );
  if (databaseName !== SAFE_DATABASE_NAME) {
    throw new Error(
      `Lifecycle E2E requires the exact database name ${SAFE_DATABASE_NAME}.`,
    );
  }

  return databaseUrl.toString();
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}.`);
  }
}

function createCredentialsContents(accounts, password) {
  return [
    `Shared password: ${password}`,
    ...accounts.map(({ role, email }) => `${role}: ${email}`),
    "",
  ].join("\n");
}

export async function runLifecycleE2E(environment = process.env) {
  const databaseUrl = validateLifecycleDatabaseUrl(
    environment.PGLMS_E2E_DATABASE_URL,
  );
  const require = createRequire(import.meta.url);
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd());

  const requiredFirebaseKeys = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
  ];
  for (const key of requiredFirebaseKeys) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key}; lifecycle E2E needs Firebase Admin.`);
    }
  }

  const runId = randomUUID();
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const roles = [
    ["HOD", "sample-hod-user"],
    ["ADMINISTRATOR", "sample-admin-user"],
    ["SUPERVISOR", "sample-supervisor-user-1"],
    ["EXAMINER", "sample-examiner-user-1"],
    ["STUDENT", "sample-student-user-01"],
  ];
  const accounts = roles.map(([role, localUserId]) => ({
    role,
    localUserId,
    email: `pglms-e2e-${role.toLowerCase()}-${runId}@example.com`,
  }));
  const credentialsPath = join(tmpdir(), `pglms-e2e-${runId}.txt`);
  const playwrightPort = environment.PLAYWRIGHT_PORT?.trim() || "3107";
  if (!/^\d{4,5}$/.test(playwrightPort)) {
    throw new Error("PLAYWRIGHT_PORT must be a four- or five-digit local port.");
  }
  const createdFirebaseUids = [];
  let firebaseApp;
  let prisma;

  const childEnvironment = {
    ...process.env,
    ...environment,
    DATABASE_URL: databaseUrl,
    ALLOW_SAMPLE_DATA_RESET: "true",
    RESET_SAMPLE_STORAGE: "false",
    PGLMS_E2E_CREDENTIALS_FILE: credentialsPath,
    PGLMS_E2E_LIFECYCLE: "true",
    PLAYWRIGHT_BASE_URL: "",
    PLAYWRIGHT_PORT: playwrightPort,
    APP_BASE_URL: `http://localhost:${playwrightPort}`,
    CI: "true",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASS: "",
  };

  try {
    run(process.execPath, ["scripts/reset-sample-database.mjs"], childEnvironment);
    const npmCli = process.env.npm_execpath;
    if (!npmCli) {
      throw new Error("Run lifecycle E2E through npm so the build tool is known.");
    }
    run(process.execPath, [npmCli, "run", "build"], childEnvironment);

    const [{ cert, initializeApp, deleteApp }, { getAuth }, prismaModule] =
      await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("@prisma/client"),
      ]);
    firebaseApp = initializeApp(
      {
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      },
      `pglms-lifecycle-e2e-${runId}`,
    );
    const auth = getAuth(firebaseApp);
    prisma = new prismaModule.PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    for (const account of accounts) {
      const firebaseUser = await auth.createUser({
        email: account.email,
        password,
        displayName: `Lifecycle E2E ${account.role}`,
        emailVerified: true,
      });
      createdFirebaseUids.push(firebaseUser.uid);
      await auth.setCustomUserClaims(firebaseUser.uid, { role: account.role });
      await prisma.user.update({
        where: { id: account.localUserId },
        data: {
          email: account.email,
          firebaseUid: firebaseUser.uid,
          isActive: true,
        },
      });
    }
    await prisma.$disconnect();
    prisma = undefined;

    writeFileSync(
      credentialsPath,
      createCredentialsContents(accounts, password),
      { encoding: "utf8", mode: 0o600 },
    );

    const playwrightCli = require.resolve("@playwright/test/cli");
    run(
      process.execPath,
      [
        playwrightCli,
        "test",
        "--grep",
        "@lifecycle",
        "--workers=1",
        ...process.argv.slice(2),
      ],
      childEnvironment,
    );

    const deletion = await auth.deleteUsers(createdFirebaseUids);
    if (deletion.failureCount > 0) {
      throw new Error(
        `Unable to remove ${deletion.failureCount} temporary Firebase test account(s).`,
      );
    }
    createdFirebaseUids.length = 0;
    await deleteApp(firebaseApp);
    firebaseApp = undefined;
  } finally {
    if (prisma) await prisma.$disconnect();
    if (firebaseApp) {
      const { getAuth } = await import("firebase-admin/auth");
      const { deleteApp } = await import("firebase-admin/app");
      const auth = getAuth(firebaseApp);
      if (createdFirebaseUids.length > 0) {
        await auth.deleteUsers(createdFirebaseUids);
      }
      await deleteApp(firebaseApp);
    }
    if (existsSync(credentialsPath)) unlinkSync(credentialsPath);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    await runLifecycleE2E();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
