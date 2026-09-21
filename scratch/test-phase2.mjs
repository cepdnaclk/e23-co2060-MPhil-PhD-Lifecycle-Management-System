import { PrismaClient, ProposalStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Testing Phase 2 Logic ===");

  const student = await prisma.student.findFirst({
    include: {
      user: true,
      application: true,
      supervisorAssignments: {
        include: { supervisor: { include: { user: true } } }
      }
    }
  });

  if (!student) {
    console.error("No student found in DB!");
    process.exit(1);
  }

  console.log("Found student:", student.user.displayName, "(Email:", student.user.email, ")");
  console.log("Application ID:", student.application?.id, "Status:", student.application?.status);
  console.log("Supervisors assigned:", student.supervisorAssignments.length);

  if (student.applicationId) {
    const existingProposal = await prisma.researchProposal.findUnique({
      where: { applicationId: student.applicationId },
      include: { documents: true }
    });
    console.log("Existing proposal:", existingProposal?.title ?? "NONE", "Status:", existingProposal?.status ?? "N/A");
  }

  const existingEthics = await prisma.ethicsApproval.findFirst({
    where: { studentId: student.id }
  });
  console.log("Existing ethics record status:", existingEthics?.status ?? "NONE", "Stage:", existingEthics?.workflowStage ?? "N/A");
}

main().catch(console.error).finally(() => prisma.$disconnect());
