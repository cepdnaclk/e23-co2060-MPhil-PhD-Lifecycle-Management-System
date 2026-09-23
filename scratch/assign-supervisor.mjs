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

  const admin = await prisma.administrator.findFirst({
    where: { user: { email: 'admin@gmail.com' } }
  });

  if (!sandunUser?.student) {
    throw new Error("Sandun student record not found!");
  }
  if (!supervisorUser?.supervisor) {
    throw new Error("Supervisor record not found!");
  }
  if (!admin) {
    throw new Error("Admin record not found!");
  }

  // Create primary supervisor assignment
  const newAssignment = await prisma.supervisorAssignment.create({
    data: {
      studentId: sandunUser.student.id,
      supervisorId: supervisorUser.supervisor.id,
      supervisorUserId: supervisorUser.id,
      isPrimary: true,
      assignedAt: new Date(),
      effectiveFrom: new Date(),
      assignedBy: admin.id
    },
    include: {
      student: { include: { user: true } },
      supervisor: { include: { user: true } }
    }
  });

  console.log("SUCCESS! Created SupervisorAssignment:", JSON.stringify(newAssignment, null, 2));

  // Verify supervisor roster
  const rosterAssignments = await prisma.supervisorAssignment.findMany({
    where: { supervisorId: supervisorUser.supervisor.id },
    include: { student: { include: { user: true } } }
  });

  console.log(`\nSupervisor Roster count: ${rosterAssignments.length}`);
  const isInRoster = rosterAssignments.some(a => a.student.user.email === 'sandun@gmail.com');
  console.log(`Is sandun@gmail.com in supervisor@gmail.com roster? ${isInRoster}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
