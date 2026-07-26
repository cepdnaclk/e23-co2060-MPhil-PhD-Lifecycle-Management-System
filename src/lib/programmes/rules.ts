import { ProgramType, StudyMode } from "@prisma/client";

export type ProgrammeRule = {
  programType: ProgramType;
  studyMode: StudyMode;
  durationMonths: number;
  milestoneIntervalMonths: 6;
  milestoneCount: number;
};

const RULES: Record<ProgramType, Record<StudyMode, ProgrammeRule>> = {
  MPHIL: {
    FULL_TIME: {
      programType: ProgramType.MPHIL,
      studyMode: StudyMode.FULL_TIME,
      durationMonths: 24,
      milestoneIntervalMonths: 6,
      milestoneCount: 4,
    },
    PART_TIME: {
      programType: ProgramType.MPHIL,
      studyMode: StudyMode.PART_TIME,
      durationMonths: 36,
      milestoneIntervalMonths: 6,
      milestoneCount: 6,
    },
  },
  PHD: {
    FULL_TIME: {
      programType: ProgramType.PHD,
      studyMode: StudyMode.FULL_TIME,
      durationMonths: 36,
      milestoneIntervalMonths: 6,
      milestoneCount: 6,
    },
    PART_TIME: {
      programType: ProgramType.PHD,
      studyMode: StudyMode.PART_TIME,
      durationMonths: 54,
      milestoneIntervalMonths: 6,
      milestoneCount: 9,
    },
  },
};

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
