import { describe, expect, it } from "vitest";

import { validateEnvironment } from "../../scripts/validate-environment.mjs";

const publicEnvironment = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "ci-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "ci.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "ci-project",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "ci.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
};

const hostedEnvironment = {
  ...publicEnvironment,
  APP_BASE_URL: "https://pgsms.example.test",
  DATABASE_URL: "postgresql://user:password@db.example.test:6543/pgsms",
  FIREBASE_PROJECT_ID: "ci-project",
  FIREBASE_CLIENT_EMAIL: "firebase@example.test",
  FIREBASE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nci-only\\n-----END PRIVATE KEY-----",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "ci-service-role-key-value",
  SUPABASE_STORAGE_BUCKET: "documents",
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_USER: "smtp-user",
  SMTP_PASS: "smtp-password",
  SMTP_FROM: "PGSMS <pgsms@example.test>",
  PUBLIC_RATE_LIMIT_SECRET: "r".repeat(32),
  CRON_SECRET: "c".repeat(32),
};

describe("environment validation", () => {
  it("rejects missing public values during every production build", () => {
    const result = validateEnvironment({});

    expect(result.errors).toContainEqual(
      expect.stringContaining("NEXT_PUBLIC_FIREBASE_API_KEY"),
    );
  });

  it("accepts the public build-time contract without requiring server secrets", () => {
    expect(validateEnvironment(publicEnvironment)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("validates the hosted server contract and reports deferred scanning", () => {
    const result = validateEnvironment(hostedEnvironment, {
      validateHostedServer: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/document uploads will return 503/i),
    );
  });

  it("reports the temporary unscanned upload mode explicitly", () => {
    const result = validateEnvironment(
      { ...hostedEnvironment, ALLOW_UNSCANNED_UPLOADS: "true" },
      { validateHostedServer: true },
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/uploaded files are not malware-scanned/i),
    );
  });

  it("rejects a partial malware-scanner configuration", () => {
    const result = validateEnvironment(
      { ...hostedEnvironment, MALWARE_SCANNER_URL: "https://scanner.example.test" },
      { validateHostedServer: true },
    );

    expect(result.errors).toContain(
      "MALWARE_SCANNER_URL and MALWARE_SCANNER_TOKEN must be configured together.",
    );
  });

  it("rejects short abuse-control secrets", () => {
    const result = validateEnvironment(
      { ...hostedEnvironment, CRON_SECRET: "short" },
      { validateHostedServer: true },
    );

    expect(result.errors).toContain(
      "CRON_SECRET must be at least 32 characters.",
    );
  });
});
