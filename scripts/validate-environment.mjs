import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";

const { loadEnvConfig } = nextEnv;

const PUBLIC_BUILD_VARIABLES = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

const HOSTED_SERVER_VARIABLES = [
  "APP_BASE_URL",
  "DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "PUBLIC_RATE_LIMIT_SECRET",
  "CRON_SECRET",
];

function isPlaceholder(value) {
  return /replace[-_ ]?me|example\.invalid/i.test(value);
}

function requireConfigured(environment, name, errors) {
  const value = environment[name]?.trim();
  if (!value || isPlaceholder(value)) {
    errors.push(`${name} is missing or still contains a placeholder value.`);
  }
}

function requireUrl(environment, name, protocols, errors) {
  const value = environment[name]?.trim();
  if (!value || isPlaceholder(value)) return;

  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${name} must use ${protocols.join(" or ")}.`);
    }
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

export function validateEnvironment(
  environment,
  { validateHostedServer = false } = {},
) {
  const errors = [];
  const warnings = [];

  for (const name of PUBLIC_BUILD_VARIABLES) {
    requireConfigured(environment, name, errors);
  }

  if (validateHostedServer) {
    for (const name of HOSTED_SERVER_VARIABLES) {
      requireConfigured(environment, name, errors);
    }

    requireUrl(environment, "APP_BASE_URL", ["https:", "http:"], errors);
    requireUrl(environment, "DATABASE_URL", ["postgresql:", "postgres:"], errors);
    requireUrl(environment, "SUPABASE_URL", ["https:"], errors);

    const rateLimitSecret = environment.PUBLIC_RATE_LIMIT_SECRET?.trim() ?? "";
    if (rateLimitSecret && rateLimitSecret.length < 32) {
      errors.push("PUBLIC_RATE_LIMIT_SECRET must be at least 32 characters.");
    }
    const cronSecret = environment.CRON_SECRET?.trim() ?? "";
    if (cronSecret && cronSecret.length < 32) {
      errors.push("CRON_SECRET must be at least 32 characters.");
    }
  }

  const scannerUrl = environment.MALWARE_SCANNER_URL?.trim();
  const scannerToken = environment.MALWARE_SCANNER_TOKEN?.trim();
  const allowUnscannedUploads =
    environment.ALLOW_UNSCANNED_UPLOADS === "true";
  if (Boolean(scannerUrl) !== Boolean(scannerToken)) {
    errors.push(
      "MALWARE_SCANNER_URL and MALWARE_SCANNER_TOKEN must be configured together.",
    );
  } else if (!scannerUrl && validateHostedServer) {
    warnings.push(
      allowUnscannedUploads
        ? "Temporary unscanned upload mode is enabled; uploaded files are not malware-scanned."
        : "Malware scanning is deferred; production document uploads will return 503.",
    );
  } else if (scannerUrl) {
    requireUrl(environment, "MALWARE_SCANNER_URL", ["https:"], errors);
  }

  return { errors, warnings };
}

export function runEnvironmentValidation(environment = process.env) {
  const validateHostedServer =
    environment.VERCEL === "1" ||
    environment.PGLMS_VALIDATE_SERVER_ENV === "true";
  const result = validateEnvironment(environment, { validateHostedServer });

  for (const warning of result.warnings) {
    console.warn(`ENV WARNING: ${warning}`);
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`ENV ERROR: ${error}`);
    }
    throw new Error(
      `Environment validation failed with ${result.errors.length} error(s).`,
    );
  }

  console.log(
    `Environment validation passed (${validateHostedServer ? "hosted server and public" : "public build"} contract).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  runEnvironmentValidation();
}
