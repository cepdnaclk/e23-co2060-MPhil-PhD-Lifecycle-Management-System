import { describe, expect, it } from "vitest";

import {
  assertSingleCurrentThesisVersion,
  ThesisVersionError,
} from "@/lib/theses/versions";

describe("thesis logical versions", () => {
  it("accepts many files inside one current logical version", () => {
    expect(() =>
      assertSingleCurrentThesisVersion([
        { isCurrent: false },
        { isCurrent: true },
      ]),
    ).not.toThrow();
  });

  it("rejects competing current logical versions", () => {
    expect(() =>
      assertSingleCurrentThesisVersion([
        { isCurrent: true },
        { isCurrent: true },
      ]),
    ).toThrowError(
      new ThesisVersionError(
        "Exactly one logical thesis version must be current.",
        409,
      ),
    );
  });
});
