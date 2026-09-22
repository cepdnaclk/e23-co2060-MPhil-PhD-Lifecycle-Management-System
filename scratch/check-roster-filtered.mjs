import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sandunUser = await prisma.user.findUnique({
    where: { email: 'sandun@gmail.com' },
    include: { student: true }
  });

  const supervisorUser = await prisma.user.findUnique({
    where: { email: 'supervisor@gmail.com' },
    include: { supervisor: true }
  });

  console.log("Sandun User & Student:", sandunUser);
  console.log("Supervisor User & Profile:", supervisorUser);

  if (sandunUser?.student) {
    const assignments = await prisma.supervisorAssignment.findMany({
      where: { studentId: sandunUser.student.id },
      include: { supervisor: { include: { user: true } }, student: { include: { user: true } } }
    });
    console.log("Assignments for Sandun:", assignments);
  }

  if (supervisorUser?.supervisor) {
    const rosterAssignments = await prisma.supervisorAssignment.findMany({
      where: { supervisorId: supervisorUser.supervisor.id },
      include: { student: { include: { user: true } } }
    });
    console.log("Roster Assignments for Supervisor:", rosterAssignments);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
