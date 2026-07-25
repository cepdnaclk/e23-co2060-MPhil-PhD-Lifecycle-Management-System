import { AcademicStatus, PrismaClient, ProgramType, UserRole } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { createStudentWithUser } from "@/lib/prisma/student-repository";

function getSafeTestDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL?.trim();

  if (!value) {
    return undefined;
  }

  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  const hasTestDatabaseName =
    databaseName === "test" ||
    databaseName === "ci" ||
    /(?:^|[-_])(test|ci)(?:[-_]|$)/.test(databaseName);

  if (!hasTestDatabaseName) {
    throw new Error(
      "TEST_DATABASE_URL must name a dedicated test database containing 'test' or 'ci'.",
    );
  }

  const isLocalHost = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (!isLocalHost && process.env.ALLOW_REMOTE_TEST_DATABASE !== "true") {
    throw new Error(
      "Remote test databases require ALLOW_REMOTE_TEST_DATABASE=true and an explicitly isolated database.",
    );
  }

  return value;
}

const testDatabaseUrl = getSafeTestDatabaseUrl();
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

const describeIfDatabase = testDatabaseUrl ? describe : describe.skip;

describeIfDatabase("createStudentWithUser", () => {
  const prisma = new PrismaClient();
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdStudentIds.length > 0) {
      await prisma.student.deleteMany({
        where: {
          id: {
            in: createdStudentIds,
          },
        },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await prisma.$disconnect();
  });

  it("creates a Student record linked to a User record", async () => {
    const uniqueSuffix = Date.now().toString();

    const student = await createStudentWithUser(prisma, {
      user: {
        email: `integration-student-${uniqueSuffix}@example.com`,
        displayName: "Integration Student",
        role: UserRole.STUDENT,
      },
      student: {
        programType: ProgramType.MPHIL,
        academicStatus: AcademicStatus.ACTIVE,
        enrollmentDate: new Date(),
      },
    });

    createdStudentIds.push(student.id);
    createdUserIds.push(student.userId);

    expect(student.userId).toBeTruthy();
    expect(student.user.email).toContain("integration-student");

    const persistedStudent = await prisma.student.findUnique({
      where: { id: student.id },
      include: { user: true },
    });

    expect(persistedStudent?.user.role).toBe(UserRole.STUDENT);
    expect(persistedStudent?.user.id).toBe(student.userId);
  });
});
