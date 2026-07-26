import { readFile } from "node:fs/promises";

import {
  AcademicStatus,
  ApplicationStatus,
  ArchiveStatus,
  AssignmentStatus,
  CompletionStatus,
  CorrectionOrderStatus,
  CorrectionType,
  DepartmentDecision,
  EthicsApplicability,
  EthicsRecordStatus,
  EthicsWorkflowStage,
  GraduationStatus,
  MilestoneStatus,
  PrismaClient,
  ProgramType,
  ProgressSubmissionStatus,
  ProposalStatus,
  ReadinessDecision,
  RegistrationStatus,
  StudyMode,
  ThesisStatus,
  UserRole,
  VivaOutcome,
} from "@prisma/client";

const prisma = new PrismaClient();
const department = "Department of Computer Engineering";
const seedDate = new Date("2026-01-01T00:00:00.000Z");

const programmeRules = JSON.parse(
  await readFile(
    new URL("../src/lib/programmes/programme-rules.json", import.meta.url),
    "utf8",
  ),
);

function addMonths(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function readConfiguredUsers() {
  const raw = process.env.PGLMS_SEED_USERS_JSON?.trim();
  if (!raw) return [];

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

  const profileData = { userId: user.id, department: input.department ?? null };
  if (input.role === UserRole.STUDENT) {
    await prisma.student.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        programType: input.programType ?? ProgramType.MPHIL,
        studyMode: input.studyMode ?? StudyMode.FULL_TIME,
        academicStatus: AcademicStatus.ACTIVE,
        enrollmentDate: new Date(input.enrollmentDate ?? seedDate),
      },
      update: {},
    });
  } else if (input.role === UserRole.SUPERVISOR) {
    await prisma.supervisor.upsert({
      where: { userId: user.id },
      create: profileData,
      update: {},
    });
  } else if (input.role === UserRole.EXAMINER) {
    await prisma.examiner.upsert({
      where: { userId: user.id },
      create: profileData,
      update: {},
    });
  } else if (input.role === UserRole.ADMINISTRATOR) {
    await prisma.administrator.upsert({
      where: { userId: user.id },
      create: profileData,
      update: {},
    });
  } else if (input.role === UserRole.HOD) {
    await prisma.hod.upsert({
      where: { userId: user.id },
      create: profileData,
      update: {},
    });
  }
}

async function createRoleUser({ id, role, displayName, email }) {
  await prisma.user.create({
    data: { id, role, displayName, email, isActive: true },
  });

  const data = { id: `${id}-profile`, userId: id, department };
  if (role === UserRole.HOD) return prisma.hod.create({ data });
  if (role === UserRole.ADMINISTRATOR) {
    return prisma.administrator.create({ data });
  }
  if (role === UserRole.SUPERVISOR) {
    return prisma.supervisor.create({
      data: { ...data, specialization: "Postgraduate research supervision" },
    });
  }
  if (role === UserRole.EXAMINER) {
    return prisma.examiner.create({
      data: { ...data, specialization: "Postgraduate thesis examination" },
    });
  }
  throw new Error(`Unsupported sample role: ${role}`);
}

async function seedProgrammeRules() {
  for (const rule of programmeRules) {
    await prisma.programmeRule.upsert({
      where: {
        programType_studyMode: {
          programType: rule.programType,
          studyMode: rule.studyMode,
        },
      },
      create: rule,
      update: { ...rule, isActive: true },
    });
  }
}

async function seedApplicationQueue(supervisors, hodUserId) {
  const stages = [
    {
      id: "sample-application-submitted",
      applicantName: "Sample Submitted Applicant",
      applicantEmail: "submitted.applicant@example.invalid",
      status: ApplicationStatus.SUBMITTED,
      supervisorConsentStatus: "PENDING",
      departmentDecision: DepartmentDecision.PENDING,
    },
    {
      id: "sample-application-review",
      applicantName: "Sample Review Applicant",
      applicantEmail: "review.applicant@example.invalid",
      status: ApplicationStatus.UNDER_REVIEW,
      supervisorConsentStatus: "CONSENTED",
      departmentDecision: DepartmentDecision.PENDING,
    },
    {
      id: "sample-application-revision",
      applicantName: "Sample Revision Applicant",
      applicantEmail: "revision.applicant@example.invalid",
      status: ApplicationStatus.UNDER_REVIEW,
      supervisorConsentStatus: "CONSENTED",
      departmentDecision: DepartmentDecision.REVISION_REQUIRED,
    },
    {
      id: "sample-application-admitted",
      applicantName: "Sample Admitted Applicant",
      applicantEmail: "admitted.applicant@example.invalid",
      status: ApplicationStatus.ADMITTED,
      supervisorConsentStatus: "CONSENTED",
      departmentDecision: DepartmentDecision.APPROVED,
    },
  ];

  for (const [index, stage] of stages.entries()) {
    await prisma.application.create({
      data: {
        ...stage,
        programType: index % 2 === 0 ? ProgramType.MPHIL : ProgramType.PHD,
        studyMode: index < 2 ? StudyMode.FULL_TIME : StudyMode.PART_TIME,
        proposalTitle: `Sample application proposal ${index + 1}`,
        proposalAbstract: "A non-confidential sample proposal for local demonstrations.",
        proposedSupervisorId: supervisors[index].id,
        proposedSupervisorUserId: supervisors[index].userId,
        supervisorConsentRecordedAt:
          stage.supervisorConsentStatus === "CONSENTED" ? seedDate : null,
        hodDecisionByUserId:
          stage.departmentDecision === DepartmentDecision.PENDING
            ? null
            : hodUserId,
        hodDecisionAt:
          stage.departmentDecision === DepartmentDecision.PENDING
            ? null
            : seedDate,
        hodDecisionReason:
          stage.departmentDecision === DepartmentDecision.REVISION_REQUIRED
            ? "Clarify the sample methodology before resubmission."
            : null,
      },
    });
  }
}

async function seedStudent({
  index,
  programType,
  studyMode,
  scenario,
  supervisor,
  examiner,
  administrator,
  hodUserId,
}) {
  const suffix = String(index + 1).padStart(2, "0");
  const userId = `sample-student-user-${suffix}`;
  const studentId = `sample-student-${suffix}`;
  const applicationId = `sample-student-application-${suffix}`;
  const registrationId = `sample-registration-${suffix}`;
  const rule = programmeRules.find(
    (item) =>
      item.programType === programType && item.studyMode === studyMode,
  );
  const expectedCompletionDate = addMonths(seedDate, rule.durationMonths);

  await prisma.user.create({
    data: {
      id: userId,
      email: `student.${suffix}@example.invalid`,
      displayName: `Sample Student ${suffix}`,
      role: UserRole.STUDENT,
      isActive: true,
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      userId,
      programType,
      studyMode,
      academicStatus:
        scenario === "archived"
          ? AcademicStatus.ARCHIVED
          : scenario === "completed"
            ? AcademicStatus.COMPLETED
            : AcademicStatus.ACTIVE,
      enrollmentDate: seedDate,
      expectedCompletionDate,
      isArchived: scenario === "archived",
    },
  });
  await prisma.application.create({
    data: {
      id: applicationId,
      applicantName: `Sample Student ${suffix}`,
      applicantEmail: `student.${suffix}@example.invalid`,
      status: ApplicationStatus.ADMITTED,
      programType,
      studyMode,
      proposalTitle: `Department V1 sample research ${suffix}`,
      proposalAbstract: "Synthetic sample data for local workflow verification.",
      proposedSupervisorId: supervisor.id,
      proposedSupervisorUserId: supervisor.userId,
      supervisorConsentStatus: "CONSENTED",
      supervisorConsentRecordedAt: seedDate,
      departmentDecision: DepartmentDecision.APPROVED,
      hodDecisionByUserId: hodUserId,
      hodDecisionAt: seedDate,
      studentId,
    },
  });
  await prisma.registration.create({
    data: {
      id: registrationId,
      studentId,
      startDate: seedDate,
      expectedCompletionDate,
      status:
        scenario === "archived"
          ? RegistrationStatus.ARCHIVED
          : scenario === "completed"
            ? RegistrationStatus.COMPLETED
            : RegistrationStatus.ACTIVE,
      completedAt: ["completed", "archived"].includes(scenario)
        ? addMonths(seedDate, 24)
        : null,
      archivedAt: scenario === "archived" ? addMonths(seedDate, 48) : null,
    },
  });
  await prisma.admissionExecution.create({
    data: {
      id: `sample-admission-${suffix}`,
      applicationId,
      executedByUserId: administrator.userId,
      studentId,
      registrationId,
      executedAt: seedDate,
    },
  });
  await prisma.supervisorAssignment.create({
    data: {
      id: `sample-supervisor-assignment-${suffix}`,
      studentId,
      supervisorId: supervisor.id,
      supervisorUserId: supervisor.userId,
      isPrimary: true,
      assignedAt: seedDate,
      effectiveFrom: seedDate,
      assignedBy: administrator.id,
    },
  });

  const milestones = [];
  for (let sequenceNumber = 1; sequenceNumber <= rule.milestoneCount; sequenceNumber += 1) {
    const completed = sequenceNumber <= Math.min(index, rule.milestoneCount);
    milestones.push(
      await prisma.studentMilestone.create({
        data: {
          id: `sample-milestone-${suffix}-${sequenceNumber}`,
          studentId,
          sequenceNumber,
          dueDate: addMonths(seedDate, sequenceNumber * rule.milestoneIntervalMonths),
          status: completed
            ? MilestoneStatus.APPROVED
            : sequenceNumber === Math.min(index + 1, rule.milestoneCount)
              ? MilestoneStatus.DUE
              : MilestoneStatus.SCHEDULED,
          completedAt: completed ? addMonths(seedDate, sequenceNumber * 6) : null,
        },
      }),
    );
  }

  if (index > 0) {
    await prisma.progressReport.create({
      data: {
        id: `sample-progress-${suffix}`,
        studentId,
        milestoneId: milestones[0].id,
        periodLabel: "Milestone 1",
        narrative: "Synthetic progress evidence for the Department V1 sample.",
        status: ProgressSubmissionStatus.APPROVED,
        submittedAt: addMonths(seedDate, 6),
        approvedAt: addMonths(seedDate, 6),
        approvedByUserId: supervisor.userId,
      },
    });
  }

  const proposal = await prisma.researchProposal.create({
    data: {
      id: `sample-proposal-${suffix}`,
      studentId,
      applicationId,
      title: `Department V1 sample research ${suffix}`,
      abstract: "Synthetic proposal content.",
      status: ProposalStatus.APPROVED,
      currentVersion: 1,
    },
  });
  await prisma.proposalVersion.create({
    data: {
      id: `sample-proposal-version-${suffix}`,
      researchProposalId: proposal.id,
      versionNumber: 1,
      isCurrent: true,
      manifestHash: `sample-proposal-manifest-${suffix}`,
      submittedByUserId: userId,
      submittedAt: seedDate,
    },
  });

  if (index >= 1) {
    await prisma.ethicsApproval.create({
      data: {
        id: `sample-ethics-${suffix}`,
        studentId,
        title: `Sample ethics record ${suffix}`,
        summary: "Synthetic ethics workflow record.",
        applicability:
          index % 2 === 0
            ? EthicsApplicability.NOT_REQUIRED
            : EthicsApplicability.REQUIRED,
        status:
          index % 2 === 0
            ? EthicsRecordStatus.EXEMPT
            : EthicsRecordStatus.APPROVED,
        workflowStage: EthicsWorkflowStage.COMPLETED,
        studentDeclaredAt: seedDate,
        supervisorRecommendedAt: seedDate,
        coordinatorRecordedAt: seedDate,
        hodConfirmedAt: seedDate,
        statusRecordedBy: hodUserId,
        statusRecordedAt: seedDate,
        referenceNumber: `SAMPLE-ETHICS-${suffix}`,
      },
    });
  }

  if (index < 2) return;

  const thesisStatus =
    scenario === "archived"
      ? ThesisStatus.ARCHIVED
      : scenario === "completed"
        ? ThesisStatus.COMPLETED
        : scenario.startsWith("correction")
          ? ThesisStatus.CORRECTIONS_REQUIRED
          : ThesisStatus.UNDER_EXAMINATION;
  const thesis = await prisma.thesis.create({
    data: {
      id: `sample-thesis-${suffix}`,
      studentId,
      title: `Sample thesis ${suffix}`,
      abstract: "Synthetic thesis metadata for local verification.",
      status: thesisStatus,
      isArchived: scenario === "archived",
    },
  });
  const thesisVersion = await prisma.thesisVersion.create({
    data: {
      id: `sample-thesis-version-${suffix}`,
      thesisId: thesis.id,
      versionNumber: 1,
      isCurrent: true,
      manifestHash: `sample-thesis-manifest-${suffix}`,
      submittedByUserId: userId,
      submittedAt: addMonths(seedDate, 18),
    },
  });
  await prisma.thesisReadinessCertification.create({
    data: {
      id: `sample-readiness-${suffix}`,
      thesisId: thesis.id,
      studentId,
      certifiedByUserId: supervisor.userId,
      hodApprovedByUserId: index >= 3 ? hodUserId : null,
      decision:
        index >= 3 ? ReadinessDecision.HOD_APPROVED : ReadinessDecision.REQUESTED,
      checklist: { proposalApproved: true, milestonesCurrent: true },
      certifiedAt: index >= 3 ? addMonths(seedDate, 17) : null,
      hodApprovedAt: index >= 3 ? addMonths(seedDate, 18) : null,
    },
  });

  if (index < 3) return;

  const assignment = await prisma.thesisExaminerAssignment.create({
    data: {
      id: `sample-examiner-assignment-${suffix}`,
      thesisId: thesis.id,
      thesisVersionId: thesisVersion.id,
      studentId,
      examinerId: examiner.id,
      examinerUserId: examiner.userId,
      assignedAt: addMonths(seedDate, 19),
      assignedBy: administrator.id,
      status: AssignmentStatus.ACCEPTED,
      confirmedByHodUserId: hodUserId,
      confirmedAt: addMonths(seedDate, 19),
    },
  });

  if (index < 4) return;

  const viva = await prisma.viva.create({
    data: {
      id: `sample-viva-${suffix}`,
      thesisId: thesis.id,
      scheduledDate: addMonths(seedDate, 22),
      venue: "Sample Seminar Room",
      outcome:
        scenario === "correction-major"
          ? VivaOutcome.MAJOR_CORRECTIONS
          : VivaOutcome.MINOR_CORRECTIONS,
      hodDecisionByUserId: hodUserId,
      hodDecisionAt: addMonths(seedDate, 22),
    },
  });

  if (scenario.startsWith("correction")) {
    await prisma.correctionOrder.create({
      data: {
        id: `sample-correction-${suffix}`,
        vivaId: viva.id,
        thesisId: thesis.id,
        originatingThesisVersionId: thesisVersion.id,
        orderedByHodUserId: hodUserId,
        requirementType:
          scenario === "correction-major"
            ? CorrectionType.MAJOR
            : CorrectionType.MINOR,
        requiresExaminerReview: scenario === "correction-major",
        requirements: "Address the synthetic examiner comments.",
        dueDate: addMonths(seedDate, 25),
        status: CorrectionOrderStatus.ORDERED,
      },
    });
  }

  if (!["completed", "archived"].includes(scenario)) return;

  await prisma.programmeCompletion.create({
    data: {
      id: `sample-completion-${suffix}`,
      studentId,
      thesisId: thesis.id,
      thesisVersionId: thesisVersion.id,
      status: CompletionStatus.COMPLETED,
      approvedByHodUserId: hodUserId,
      hodApprovedAt: addMonths(seedDate, 24),
      recordedByAdminUserId: administrator.userId,
      adminRecordedAt: addMonths(seedDate, 24),
      completedAt: addMonths(seedDate, 24),
    },
  });

  if (scenario === "archived") {
    await prisma.graduationRecord.create({
      data: {
        id: `sample-graduation-${suffix}`,
        studentId,
        status: GraduationStatus.GRADUATED,
        graduationDate: addMonths(seedDate, 36),
        confirmationReference: `SAMPLE-GRAD-${suffix}`,
        recordedByUserId: administrator.userId,
      },
    });
    await prisma.studentArchiveRecord.create({
      data: {
        id: `sample-archive-${suffix}`,
        studentId,
        status: ArchiveStatus.ARCHIVED,
        archivedAt: addMonths(seedDate, 48),
        archivedByUserId: administrator.userId,
        reason: "Synthetic completed record archived for local verification.",
      },
    });
  }

  await prisma.lifecycleAuditEvent.create({
    data: {
      eventKey: `sample-lifecycle-${suffix}`,
      eventType: "SAMPLE_LIFECYCLE_STATE_CREATED",
      aggregateType: "Student",
      aggregateId: studentId,
      actorUserId: administrator.userId,
      actorRole: UserRole.ADMINISTRATOR,
      actorLabel: "Sample PG Coordinator",
      newState: scenario,
      metadata: { synthetic: true },
    },
  });
  await prisma.notification.create({
    data: {
      id: `sample-notification-${suffix}`,
      recipientId: userId,
      studentId,
      event: "PROGRAMME_COMPLETION_STATUS_CHANGED",
      title: "Sample lifecycle update",
      message: "This is synthetic local sample data.",
      actionUrl: "/dashboard/student",
    },
  });

  void assignment;
}

async function seedSampleData() {
  const hod = await createRoleUser({
    id: "sample-hod-user",
    role: UserRole.HOD,
    displayName: "Sample Head of Department",
    email: "hod@example.invalid",
  });
  const administrator = await createRoleUser({
    id: "sample-admin-user",
    role: UserRole.ADMINISTRATOR,
    displayName: "Sample PG Coordinator",
    email: "coordinator@example.invalid",
  });
  const supervisors = [];
  const examiners = [];
  for (let index = 0; index < 4; index += 1) {
    supervisors.push(
      await createRoleUser({
        id: `sample-supervisor-user-${index + 1}`,
        role: UserRole.SUPERVISOR,
        displayName: `Sample Supervisor ${index + 1}`,
        email: `supervisor.${index + 1}@example.invalid`,
      }),
    );
    examiners.push(
      await createRoleUser({
        id: `sample-examiner-user-${index + 1}`,
        role: UserRole.EXAMINER,
        displayName: `Sample Examiner ${index + 1}`,
        email: `examiner.${index + 1}@example.invalid`,
      }),
    );
  }

  await seedApplicationQueue(supervisors, hod.userId);

  const combinations = [
    ...programmeRules.flatMap((rule) => [rule, rule]),
    programmeRules[2],
    programmeRules[3],
  ];
  const scenarios = [
    "proposal",
    "ethics",
    "readiness",
    "under-examination",
    "viva",
    "correction-minor",
    "correction-major",
    "viva-pass",
    "completed",
    "archived",
  ];
  for (const [index, combination] of combinations.entries()) {
    await seedStudent({
      index,
      programType: combination.programType,
      studyMode: combination.studyMode,
      scenario: scenarios[index],
      supervisor: supervisors[index % supervisors.length],
      examiner: examiners[index % examiners.length],
      administrator,
      hodUserId: hod.userId,
    });
  }

  console.log(
    "Seeded synthetic Department V1 sample data: 1 HOD, 1 coordinator, 4 supervisors, 4 examiners, 4 queue applications, 8 active students, 1 completed student, and 1 graduated archived student.",
  );
}

async function main() {
  await seedProgrammeRules();

  if (process.env.PGLMS_SEED_SAMPLE_DATA === "true") {
    await seedSampleData();
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
