import {
  PrismaClient,
  EthicsApplicability,
  EthicsRecordStatus,
  ProposalStatus,
  UploadFileStatus,
  UserRole,
} from "@prisma/client";

import { submitResearchProposal, updateResearchProposalStatus } from "@/lib/proposals/submission";
import { createStagedUploadSession } from "@/lib/uploads/sessions";
import { uploadBufferToStorage } from "@/lib/storage";
import {
  declareEthicsNotRequired,
  recommendEthicsRecord,
  recordCoordinatorEthicsDecision,
  confirmEthicsByHod,
} from "@/lib/ethics/department-record";

import { createHash, randomUUID } from "node:crypto";

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

  // --- Pre-test Cleanup ---
  console.log("--- Cleaning existing proposal & ethics records for clean simulation ---");
  await prisma.ethicsWorkflowDecision.deleteMany({
    where: { ethicsApproval: { studentId: student.id } },
  });
  await prisma.ethicsApproval.deleteMany({
    where: { studentId: student.id },
  });
  await prisma.proposalVersion.deleteMany({
    where: { researchProposal: { studentId: student.id } },
  });
  await prisma.researchProposal.deleteMany({
    where: { studentId: student.id },
  });

  // --- Step 2.1: Research Proposal Submission ---
  console.log("\n--- Step 2.1: Research Proposal Submission (Student) ---");

  const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
  const sha256 = createHash("sha256").update(pdfBuffer).digest("hex");

  const uploadSession = await createStagedUploadSession(
    {
      purpose: "PROPOSAL",
      idempotencyKey: randomUUID(),
      files: [
        {
          fileName: "sample_proposal_v1.pdf",
          mimeType: "application/pdf",
          sizeBytes: pdfBuffer.length,
          sha256,
        },
      ],
    },
    studentAuth,
    student.id
  );

  const storagePath = uploadSession.uploads[0].storagePath;
  console.log("Staged Upload Session created:", uploadSession.uploadSessionId);
  await uploadBufferToStorage(storagePath, pdfBuffer, "application/pdf");

  await prisma.stagedUploadFile.updateMany({
    where: { uploadSessionId: uploadSession.uploadSessionId },
    data: { status: UploadFileStatus.STAGED },
  });

  const proposalResult = await submitResearchProposal(
    {
      uploadSessionId: uploadSession.uploadSessionId,
      title: "AI-Driven Healthcare Lifecycle Analytics",
      abstract: "This proposal investigates AI models for medical lifecycle data.",
    },
    studentAuth
  );
  console.log("✓ Proposal Submitted successfully! Status:", proposalResult.status, "ID:", proposalResult.id);

  // --- Step 2.2: Admin Proposal Approval ---
  console.log("\n--- Step 2.2: Admin Proposal Approval ---");
  const finalProposal = await updateResearchProposalStatus(
    proposalResult.id,
    {
      status: ProposalStatus.APPROVED,
      feedback: "Proposal meets all department research standards.",
    },
    adminAuth
  );
  console.log("✓ Proposal Approved! Status:", finalProposal.status);

  // --- Step 2.3: Ethics Applicability Declaration ---
  console.log("\n--- Step 2.3: Ethics Applicability Declaration (Student) ---");
  const ethicsRecord = await declareEthicsNotRequired(
    {
      title: "AI Healthcare Ethics Declaration",
      summary: "No human/animal biological subjects involved. Open synthetic dataset.",
      notes: "Verified with dataset license.",
    },
    studentAuth
  );
  console.log("✓ Ethics Declaration Submitted! Workflow Stage:", ethicsRecord.workflowStage);

  // --- Step 2.4: Supervisor Ethics Recommendation ---
  console.log("\n--- Step 2.4: Supervisor Ethics Recommendation ---");
  const recommended = await recommendEthicsRecord(
    ethicsRecord.id,
    {
      decision: "RECOMMEND",
      notes: "Supervisor agrees ethics approval is not required for open dataset.",
    },
    supervisorAuth
  );
  console.log("✓ Supervisor Ethics Recommendation Recorded! Stage:", recommended.workflowStage);

  // --- Step 2.5: PG Coordinator (Admin) Ethics Record ---
  console.log("\n--- Step 2.5: PG Coordinator (Admin) Ethics Record ---");
  const coordRecorded = await recordCoordinatorEthicsDecision(
    ethicsRecord.id,
    {
      decision: "RECORD",
      status: EthicsRecordStatus.EXEMPT,
      notes: "PG Coordinator confirms EXEMPT status for open synthetic data.",
    },
    adminAuth
  );
  console.log("✓ Coordinator Ethics Status Recorded! Stage:", coordRecorded.workflowStage);

  // --- Step 2.6: Head of Department Ethics Confirmation ---
  console.log("\n--- Step 2.6: Head of Department Ethics Confirmation ---");
  const hodConfirmed = await confirmEthicsByHod(
    ethicsRecord.id,
    {
      decision: "CONFIRM",
      notes: "HOD confirms ethics exemption.",
    },
    hodAuth
  );
  console.log("✓ HOD Ethics Confirmation Completed! Stage:", hodConfirmed.workflowStage, "Final Status:", hodConfirmed.status);

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
  console.log("   PHASE 2 END-TO-END TEST PASSED 100%!   ");
  console.log("==========================================\n");
}

main().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
