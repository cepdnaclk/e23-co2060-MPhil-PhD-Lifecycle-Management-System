import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(
    "prisma/migrations/20260726140000_add_department_v1_core_domain/migration.sql",
  ),
  "utf8",
);

describe("Department V1 schema contract", () => {
  it("exposes only MPhil and PhD as programme enum values", () => {
    const programEnum = schema.match(/enum ProgramType \{([\s\S]*?)\}/)?.[1];

    expect(programEnum).toBeDefined();
    expect(programEnum).toContain("MPHIL");
    expect(programEnum).toContain("PHD");
    expect(programEnum).not.toContain("MSC");
    expect(programEnum).not.toContain("MENG");
  });

  it("refuses to silently coerce legacy MSc or MEng data", () => {
    expect(migration).toContain(
      "Department V1 supports only MPHIL and PHD; migrate legacy MSc/MEng rows first",
    );
  });

  it("contains independent completion, graduation, and archive records", () => {
    expect(schema).toContain("model ProgrammeCompletion");
    expect(schema).toContain("model GraduationRecord");
    expect(schema).toContain("model StudentArchiveRecord");
    expect(schema).toContain("thesisVersionId       String");
    expect(schema).toContain("confirmationReference String");
  });

  it("keeps completion distinct from graduation and archive states", () => {
    expect(schema).toMatch(
      /enum CompletionStatus \{[\s\S]*?HOD_APPROVED[\s\S]*?COMPLETED[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum AcademicStatus \{[\s\S]*?COMPLETED[\s\S]*?GRADUATED[\s\S]*?ARCHIVED[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum RegistrationStatus \{[\s\S]*?COMPLETED[\s\S]*?ARCHIVED[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum ThesisStatus \{[\s\S]*?CORRECTIONS_APPROVED[\s\S]*?COMPLETED[\s\S]*?FINAL_ARCHIVE[\s\S]*?\}/,
    );
  });
});
