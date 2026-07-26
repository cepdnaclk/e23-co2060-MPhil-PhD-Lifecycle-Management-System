import { ProgramType, StudyMode } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  buildProgrammeSchedule,
  getProgrammeRule,
} from "@/lib/programmes/rules";

describe("Department programme rules", () => {
  it.each([
    [ProgramType.MPHIL, StudyMode.FULL_TIME, 24, 4],
    [ProgramType.MPHIL, StudyMode.PART_TIME, 36, 6],
    [ProgramType.PHD, StudyMode.FULL_TIME, 36, 6],
    [ProgramType.PHD, StudyMode.PART_TIME, 54, 9],
  ])(
    "uses the approved duration and milestone count for %s %s",
    (programType, studyMode, durationMonths, milestoneCount) => {
      expect(getProgrammeRule(programType, studyMode)).toMatchObject({
        durationMonths,
        milestoneIntervalMonths: 6,
        milestoneCount,
      });
    },
  );

  it("builds every milestone from exact six-calendar-month offsets", () => {
    const start = new Date("2026-01-15T08:30:00.000Z");
    const schedule = buildProgrammeSchedule({
      programType: ProgramType.MPHIL,
      studyMode: StudyMode.FULL_TIME,
      registrationStartDate: start,
    });

    expect(schedule.milestones.map((milestone) => milestone.dueDate.toISOString()))
      .toEqual([
        "2026-07-15T08:30:00.000Z",
        "2027-01-15T08:30:00.000Z",
        "2027-07-15T08:30:00.000Z",
        "2028-01-15T08:30:00.000Z",
      ]);
    expect(schedule.registrationEndDate.toISOString()).toBe(
      "2028-01-15T08:30:00.000Z",
    );
  });

  it("clamps end-of-month offsets rather than using a fixed day count", () => {
    expect(
      addCalendarMonths(new Date("2024-08-31T00:00:00.000Z"), 6).toISOString(),
    ).toBe("2025-02-28T00:00:00.000Z");
  });
});
