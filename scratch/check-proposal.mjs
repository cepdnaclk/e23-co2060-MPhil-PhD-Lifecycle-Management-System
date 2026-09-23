import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sandunUser = await prisma.user.findUnique({
    where: { email: 'sandun@gmail.com' },
    include: {
      student: {
        include: {
          researchProposals: {
            include: {
              versions: true,
              evaluations: { include: { examiner: { include: { user: true } } } }
            }
          },
          application: true
        }
      }
    }
  });

  console.log("Sandun's Student Record:");
  console.log("  Application:", JSON.stringify(sandunUser?.student?.application, null, 2));
  console.log("  Research Proposals:", JSON.stringify(sandunUser?.student?.researchProposals, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
