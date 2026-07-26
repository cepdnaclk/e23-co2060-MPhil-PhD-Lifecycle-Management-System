import {
  AcademicStatus,
  PrismaClient,
  ProgramType,
  StudyMode,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const programmeRules = [
  [ProgramType.MPHIL, StudyMode.FULL_TIME, 24, 4],
  [ProgramType.MPHIL, StudyMode.PART_TIME, 36, 6],
  [ProgramType.PHD, StudyMode.FULL_TIME, 36, 6],
  [ProgramType.PHD, StudyMode.PART_TIME, 54, 9],
];

function readConfiguredUsers() {
  const raw = process.env.PGLMS_SEED_USERS_JSON?.trim();

  if (!raw) {
    return [];
  }

  const users = JSON.parse(raw);

  if (!Array.isArray(users)) {
    throw new Error("PGLMS_SEED_USERS_JSON must contain a JSON array.");
  }

  return users;
}

async function seedUser(input) {
  if (
    !Object.values(UserRole).includes(input.role) ||
    typeof input.email !== "string" ||
    typeof input.displayName !== "string" ||
    typeof input.firebaseUid !== "string"
  ) {
    throw new Error(
      "Every configured seed user requires a valid role, email, displayName, and existing Firebase UID.",
    );
  }

  const user = await prisma.user.upsert({
    where: { email: input.email.trim().toLowerCase() },
    create: {
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      firebaseUid: input.firebaseUid,
      role: input.role,
      isActive: true,
    },
    update: {
      displayName: input.displayName.trim(),
      firebaseUid: input.firebaseUid,
      role: input.role,
      isActive: true,
    },
  });

  switch (input.role) {
    case UserRole.STUDENT:
      await prisma.student.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          programType: input.programType ?? ProgramType.MPHIL,
          studyMode: input.studyMode ?? StudyMode.FULL_TIME,
          academicStatus: AcademicStatus.ACTIVE,
          enrollmentDate: new Date(input.enrollmentDate ?? "2026-01-01T00:00:00.000Z"),
        },
        update: {},
      });
      break;
    case UserRole.SUPERVISOR:
      await prisma.supervisor.upsert({
        where: { userId: user.id },
        create: { userId: user.id, department: input.department ?? null },
        update: {},
      });
      break;
    case UserRole.EXAMINER:
      await prisma.examiner.upsert({
        where: { userId: user.id },
        create: { userId: user.id, department: input.department ?? null },
        update: {},
      });
      break;
    case UserRole.ADMINISTRATOR:
      await prisma.administrator.upsert({
        where: { userId: user.id },
        create: { userId: user.id, department: input.department ?? null },
        update: {},
      });
      break;
    case UserRole.HOD:
      await prisma.hod.upsert({
        where: { userId: user.id },
        create: { userId: user.id, department: input.department ?? null },
        update: {},
      });
      break;
  }
}

async function main() {
  for (const [programType, studyMode, durationMonths, milestoneCount] of programmeRules) {
    await prisma.programmeRule.upsert({
      where: { programType_studyMode: { programType, studyMode } },
      create: {
        programType,
        studyMode,
        durationMonths,
        milestoneIntervalMonths: 6,
        milestoneCount,
      },
      update: {
        durationMonths,
        milestoneIntervalMonths: 6,
        milestoneCount,
        isActive: true,
      },
    });
  }

  for (const user of readConfiguredUsers()) {
    await seedUser(user);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
