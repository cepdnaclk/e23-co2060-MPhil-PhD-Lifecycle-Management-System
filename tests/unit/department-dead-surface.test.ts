import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Department V1 dead-surface audit", () => {
  it.each([
    "src/app/(dashboard)/student/progress/page.tsx",
    "src/app/dashboard/[role]/page.tsx",
    "src/app/dashboard/student/progress-reports/submit/page.tsx",
    "src/app/api/cron/check-registrations/route.ts",
    "src/components/supervisor/progress-report-signoff-list.tsx",
    "scripts/test-supervisor-logic.mjs",
    "scripts/test-supabase.mjs",
    "scripts/test-put.mjs",
  ])("keeps retired surface absent: %s", (relativePath) => {
    expect(existsSync(join(root, relativePath))).toBe(false);
  });

  it("uses the guarded reset wrapper rather than a direct destructive command", () => {
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    expect(packageJson.scripts["db:reset:sample"]).toBe(
      "node scripts/reset-sample-database.mjs",
    );
    expect(packageJson.scripts["database:reset"]).toBe(
      packageJson.scripts["db:reset:sample"],
    );
  });

  it("does not expose placeholder dashboard links or a settings route", () => {
    const profileDropdown = readFileSync(
      join(root, "src/components/profile-dropdown.tsx"),
      "utf8",
    );
    const supervisorProfile = readFileSync(
      join(root, "src/components/supervisor/supervisor-student-profile.tsx"),
      "utf8",
    );

    expect(profileDropdown).not.toContain("/dashboard/settings");
    expect(supervisorProfile).not.toContain('href="#"');
  });
});
