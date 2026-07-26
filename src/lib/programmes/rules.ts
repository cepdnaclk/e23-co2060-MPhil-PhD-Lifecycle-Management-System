import { ProgramType, StudyMode } from "@prisma/client";
import programmeRuleData from "./programme-rules.json";

export type ProgrammeRule = {
  programType: ProgramType;
  studyMode: StudyMode;
  durationMonths: number;
  milestoneIntervalMonths: 6;
  milestoneCount: number;
};

const RULES = programmeRuleData.reduce(
  (rules, item) => {
    const programType = ProgramType[item.programType as keyof typeof ProgramType];
    const studyMode = StudyMode[item.studyMode as keyof typeof StudyMode];
    rules[programType][studyMode] = {
      ...item,
      programType,
      studyMode,
      milestoneIntervalMonths: 6,
    };
    return rules;
  },
  {
    [ProgramType.MPHIL]: {} as Record<StudyMode, ProgrammeRule>,
    [ProgramType.PHD]: {} as Record<StudyMode, ProgrammeRule>,
  },
);

export function getProgrammeRule(
  programType: ProgramType,
  studyMode: StudyMode,
) {
  return RULES[programType][studyMode];
}

/**
 * Calendar-month arithmetic with end-of-month clamping. This avoids treating
 * six months as a fixed number of days and keeps 31st dates in the last valid
 * day of the target month.
 */
export function addCalendarMonths(date: Date, months: number) {
  if (!Number.isInteger(months)) {
    throw new Error("Calendar month offsets must be whole numbers.");
  }

  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));

  return result;
}

export function buildProgrammeSchedule(input: {
  programType: ProgramType;
  studyMode: StudyMode;
  registrationStartDate: Date;
}) {
  const rule = getProgrammeRule(input.programType, input.studyMode);

  return {
    rule,
    registrationEndDate: addCalendarMonths(
      input.registrationStartDate,
      rule.durationMonths,
    ),
    milestones: Array.from({ length: rule.milestoneCount }, (_, index) => ({
      sequenceNumber: index + 1,
      dueDate: addCalendarMonths(
        input.registrationStartDate,
        (index + 1) * rule.milestoneIntervalMonths,
      ),
    })),
  };
}
