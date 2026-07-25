import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("removed privileged security surfaces", () => {
  it("does not register the legacy Firebase claims mutation route", () => {
    expect(
      existsSync(
        join(process.cwd(), "src", "app", "api", "auth", "claims", "route.ts"),
      ),
    ).toBe(false);
  });

  it("keeps production browser source maps private and configures baseline headers", () => {
    const configSource = readFileSync(
      join(process.cwd(), "next.config.mjs"),
      "utf8",
    );

    expect(configSource).toContain("productionBrowserSourceMaps: false");
    expect(configSource).toContain("deleteSourcemapsAfterUpload: true");
    expect(configSource).toContain("Content-Security-Policy-Report-Only");
    expect(configSource).toContain("X-Content-Type-Options");
    expect(configSource).toContain("frame-ancestors 'none'");
  });
});
