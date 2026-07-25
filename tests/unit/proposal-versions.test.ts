import { describe, expect, it } from "vitest";

import {
  assertSingleCurrentProposalVersion,
  ProposalVersionError,
} from "@/lib/proposals/versions";

describe("proposal logical versions", () => {
  it("accepts many files inside one current logical version", () => {
    expect(() =>
      assertSingleCurrentProposalVersion([
        { isCurrent: false },
        { isCurrent: true },
      ]),
    ).not.toThrow();
  });

  it("rejects competing current logical versions", () => {
    expect(() =>
      assertSingleCurrentProposalVersion([
        { isCurrent: true },
        { isCurrent: true },
      ]),
    ).toThrowError(
      new ProposalVersionError(
        "Exactly one logical proposal version must be current.",
        409,
      ),
    );
  });
});
