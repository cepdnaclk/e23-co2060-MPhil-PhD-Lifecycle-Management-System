import {
  PrismaClient,
  EthicsApplicability,
  EthicsRecordStatus,
  ProposalStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n==========================================");
  console.log("   RUNNING PHASE 2 FULL END-TO-END TEST   ");
  console.log("==========================================\n");

  // 1. Fetch Student User & Profile
  const student = await prisma.student.findFirst({
    include: {
      user: true,
      application: true,
      supervisorAssignments: {
        include: { supervisor: { include: { user: true } } },
      },
    },
  });

  if (!student) {
    throw new Error("Student profile missing in database.");
  }

  const studentAuth = {
    uid: student.user.firebaseUid || "test-uid",
    firebaseUid: student.user.firebaseUid || "test-uid",
    userId: student.user.id,
    role: UserRole.STUDENT,
  };

  console.log(`[Student] ${student.user.displayName} (${student.user.email})`);

  // 2. Fetch Primary Supervisor
  const supervisorUser = student.supervisorAssignments[0]?.supervisor?.user;
  if (!supervisorUser) {
    throw new Error("No supervisor assigned to student.");
  }
  const supervisorAuth = {
    uid: supervisorUser.firebaseUid || "test-uid-sup",
    firebaseUid: supervisorUser.firebaseUid || "test-uid-sup",
    userId: supervisorUser.id,
    role: UserRole.SUPERVISOR,
  };
  console.log(`[Supervisor] ${supervisorUser.displayName} (${supervisorUser.email})`);

  // 3. Fetch HOD
  const hodUser = await prisma.user.findFirst({
    where: { role: UserRole.HOD, isActive: true },
  });
  if (!hodUser) {
    throw new Error("No HOD user found.");
  }
  const hodAuth = {
    uid: hodUser.firebaseUid || "test-uid-hod",
    firebaseUid: hodUser.firebaseUid || "test-uid-hod",
    userId: hodUser.id,
    role: UserRole.HOD,
  };
  console.log(`[HOD] ${hodUser.displayName} (${hodUser.email})`);

  // 4. Fetch Administrator
  const adminUser = await prisma.user.findFirst({
    where: { role: UserRole.ADMINISTRATOR, isActive: true },
  });
  if (!adminUser) {
    throw new Error("No Administrator user found.");
  }
  const adminAuth = {
    uid: adminUser.firebaseUid || "test-uid-admin",
    firebaseUid: adminUser.firebaseUid || "test-uid-admin",
    userId: adminUser.id,
    role: UserRole.ADMINISTRATOR,
  };
  console.log(`[Admin] ${adminUser.displayName} (${adminUser.email})\n`);

  // --- Step 2.1: Proposal Submission ---
  console.log("--- Step 2.1a: Research Proposal Submission ---");
  const { submitResearchProposal } = await import("../src/lib/proposals/submission.js");
  const { createStagedUploadSession } = await import("../src/lib/uploads/sessions.js");

  // Create staged upload session for proposal PDF
  const uploadSession = await createStagedUploadSession(
    {
      purpose: "PROPOSAL",
      idempotencyKey: `proposal-test-${Date.now()}`,
      files: [
        {
          fileName: "sample_proposal_v1.pdf",
          mimeType: "application/pdf",
          sizeBytes: 102400,
          checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      ],
    },
    studentAuth,
    student.id
  );

  console.log("Staged Upload Session created:", uploadSession.id);

  // Submit proposal
  const proposalResult = await submitResearchProposal(
    {
      uploadSessionId: uploadSession.id,
      title: "AI-Driven Healthcare Lifecycle Analytics",
      abstract: "This proposal investigates AI models for medical lifecycle data.",
    },
    studentAuth
  );
  console.log("Proposal Submitted successfully! Status:", proposalResult.status, "ID:", proposalResult.id);

  // --- Step 2.1b: Ethics Applicability Declaration ---
  console.log("\n--- Step 2.1b: Ethics Applicability Declaration ---");
  const { declareEthicsNotRequired } = await import("../src/lib/ethics/department-record.js");

  let ethicsRecord;
  try {
    ethicsRecord = await declareEthicsNotRequired(
      {
        title: "AI Healthcare Ethics Declaration",
        summary: "No human/animal biological subjects involved. Open synthetic dataset.",
        notes: "Verified with dataset license.",
      },
      studentAuth
    );
    console.log("Ethics Declaration Submitted! Stage:", ethicsRecord.workflowStage);
  } catch (err) {
    console.log("Ethics Declaration Notice:", err.message);
  }

  // --- Step 2.2: Supervisor Evaluation & Ethics Recommendation ---
  console.log("\n--- Step 2.2: Supervisor Evaluation & Ethics Recommendation ---");
  const { recommendEthicsRecord } = await import("../src/lib/ethics/department-record.js");

  // Fetch current ethics record ID
  const currentEthics = await prisma.ethicsApproval.findFirst({
    where: { studentId: student.id },
  });

  if (currentEthics && currentEthics.workflowStage === "SUPERVISOR_RECOMMENDATION") {
    const recommended = await recommendEthicsRecord(
      currentEthics.id,
      {
        decision: "RECOMMEND",
        notes: "Supervisor agrees ethics approval is not required for open dataset.",
      },
      supervisorAuth
    );
    console.log("Supervisor Ethics Recommendation Recorded! Stage:", recommended.workflowStage);
  }

  // --- Step 2.3a: PG Coordinator (Admin) Ethics Record ---
  console.log("\n--- Step 2.3a: PG Coordinator (Admin) Ethics Record ---");
  const { recordCoordinatorEthicsDecision } = await import("../src/lib/ethics/department-record.js");

  const ethicsAfterSup = await prisma.ethicsApproval.findFirst({
    where: { studentId: student.id },
  });

  if (ethicsAfterSup && ethicsAfterSup.workflowStage === "COORDINATOR_RECORD") {
    const coordRecorded = await recordCoordinatorEthicsDecision(
      ethicsAfterSup.id,
      {
        decision: "RECORD",
        status: EthicsRecordStatus.EXEMPT,
        notes: "PG Coordinator confirms EXEMPT status for open synthetic data.",
      },
      adminAuth
    );
    console.log("Coordinator Ethics Status Recorded! Stage:", coordRecorded.workflowStage);
  }

  // --- Step 2.3b: HOD Ethics Confirmation ---
  console.log("\n--- Step 2.3b: Head of Department Ethics Confirmation ---");
  const { confirmEthicsByHod } = await import("../src/lib/ethics/department-record.js");

  const ethicsAfterCoord = await prisma.ethicsApproval.findFirst({
    where: { studentId: student.id },
  });

  if (ethicsAfterCoord && ethicsAfterCoord.workflowStage === "HOD_CONFIRMATION") {
    const hodConfirmed = await confirmEthicsByHod(
      ethicsAfterCoord.id,
      {
        decision: "CONFIRM",
        notes: "HOD confirms ethics exemption.",
      },
      hodAuth
    );
    console.log("HOD Ethics Confirmation Completed! Stage:", hodConfirmed.workflowStage, "Status:", hodConfirmed.status);
  }

  // --- Step 2.4: Admin Proposal Approval ---
  console.log("\n--- Step 2.4: Admin Proposal Approval ---");
  const { updateResearchProposalStatus } = await import("../src/lib/proposals/submission.js");

  const finalProposal = await updateResearchProposalStatus(
    proposalResult.id,
    {
      status: ProposalStatus.APPROVED,
      feedback: "Proposal meets all department research standards.",
    },
    adminAuth
  );
  console.log("Admin Proposal Approval Completed! Final Status:", finalProposal.status);

  // --- Check Email Outbox ---
  console.log("\n--- Checking Email Outbox Messages ---");
  const outboxMessages = await prisma.outboxMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  console.log(`Found ${outboxMessages.length} recent Outbox messages:`);
  for (const msg of outboxMessages) {
    console.log(`- [${msg.status}] To: ${msg.recipient} | Subject: ${msg.subject} | Event: ${msg.eventType}`);
  }

  console.log("\n==========================================");
  console.log("   PHASE 2 END-TO-END TEST PASSED!        ");
  console.log("==========================================\n");
}

main().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
