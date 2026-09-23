import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("=== USERS ===");
  const users = await prisma.user.findMany({
    include: { student: true, supervisor: true, administrator: true, hod: true }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log("=== SUPERVISOR ASSIGNMENTS ===");
  const assignments = await prisma.supervisorAssignment.findMany({
    include: {
      student: { include: { user: true } },
      supervisor: { include: { user: true } }
    }
  });
  console.log(JSON.stringify(assignments, null, 2));

  console.log("=== APPLICATIONS ===");
  const apps = await prisma.application.findMany({
    include: {
      proposedSupervisor: { include: { user: true } },
      proposedSupervisorUser: true,
      student: { include: { user: true } }
    }
  });
  console.log(JSON.stringify(apps, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
