import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.administrator.findMany({
    include: { user: true }
  });
  console.log("Admins:", admins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
