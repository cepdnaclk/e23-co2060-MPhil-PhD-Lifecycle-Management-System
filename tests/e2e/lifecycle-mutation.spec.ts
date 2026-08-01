import {
  CorrectionOrderStatus,
  CorrectionReviewDecision,
  CorrectionReviewStage,
  DocumentType,
  DocumentVerificationStatus,
  MilestoneStatus,
  PrismaClient,
  ThesisStatus,
} from "@prisma/client";
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  EXTERNAL_TEST_ROLES,
  loadExternalTestAccounts,
  signInAs,
  type ExternalTestRole,
} from "./support/external-test-accounts";

const externalAccounts = loadExternalTestAccounts();

test.use({ screenshot: "off", trace: "off", video: "off" });

type JsonResult<T> = { status: number; payload: T };

async function postJson<T>(
  page: Page,
  path: string,
  body: unknown,
  expectedStatus = 200,
) {
  const result = await page.evaluate(
    async ({ requestPath, requestBody }) => {
      const csrfToken = document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith("pglms_csrf="))
        ?.slice("pglms_csrf=".length);
      const response = await fetch(requestPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-pglms-csrf": csrfToken } : {}),
        },
        body: JSON.stringify(requestBody),
      });
      return {
        status: response.status,
        payload: (await response.json()) as T,
      } satisfies JsonResult<T>;
    },
    { requestPath: path, requestBody: body },
  );

  expect(
    result.status,
    `POST ${path} returned ${result.status}: ${JSON.stringify(result.payload)}`,
  ).toBe(expectedStatus);
  return result.payload;
}

test.describe(
  "isolated Department V1 lifecycle mutations",
  { tag: ["@external", "@lifecycle"] },
  () => {
    test.skip(
      !externalAccounts,
      "Run through scripts/run-lifecycle-e2e.mjs with isolated fixtures.",
    );

    test("advances one Student from milestones through archived graduation", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const databaseUrl = process.env.PGLMS_E2E_DATABASE_URL;
      expect(databaseUrl).toContain("127.0.0.1");
      expect(databaseUrl).toContain("/pglms_e2e_test");

      const prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      const contexts: BrowserContext[] = [];

      try {
        const pages = {} as Record<ExternalTestRole, Page>;
        for (const role of EXTERNAL_TEST_ROLES) {
          const context = await browser.newContext();
          contexts.push(context);
          const page = await context.newPage();
          await signInAs(page, externalAccounts!, role);
          pages[role] = page;
        }

        const studentId = "sample-student-01";
        const studentUserId = "sample-student-user-01";

        const milestones = await prisma.studentMilestone.findMany({
          where: { studentId },
          orderBy: { sequenceNumber: "asc" },
        });
        expect(milestones.length).toBeGreaterThan(0);

        for (const milestone of milestones) {
          if (milestone.status !== MilestoneStatus.DUE) {
            await prisma.studentMilestone.update({
              where: { id: milestone.id },
              data: { status: MilestoneStatus.DUE, openedAt: new Date() },
            });
          }
          const submitted = await postJson<{ report: { id: string } }>(
            pages.STUDENT,
            `/api/progress/milestones/${milestone.id}/submit`,
            {
              narrative: `Lifecycle E2E milestone ${milestone.sequenceNumber} contains verified narrative progress evidence.`,
            },
            201,
          );
          await postJson(
            pages.SUPERVISOR,
            `/api/supervisor/progress-reports/${submitted.report.id}/decision`,
            { decision: "APPROVE", reason: "Lifecycle E2E approval." },
          );
        }

        const declared = await postJson<{ record: { id: string } }>(
          pages.STUDENT,
          "/api/student/ethics/declaration",
          {
            applicability: "NOT_REQUIRED",
            title: "Lifecycle E2E ethics declaration",
            summary:
              "This synthetic research uses no human participants or identifiable personal data.",
          },
          201,
        );
        await postJson(
          pages.SUPERVISOR,
          `/api/supervisor/ethics/${declared.record.id}/recommendation`,
          { decision: "RECOMMEND", notes: "Synthetic declaration reviewed." },
        );
        await postJson(
          pages.ADMINISTRATOR,
          `/api/admin/ethics/${declared.record.id}/record`,
          {
            decision: "RECORD",
            status: "EXEMPT",
            referenceNumber: "E2E-ETHICS-001",
            notes: "Recorded for the isolated lifecycle test.",
          },
        );
        await postJson(
          pages.HOD,
          `/api/hod/ethics/${declared.record.id}/confirmation`,
          { decision: "CONFIRM", notes: "Confirmed for lifecycle E2E." },
        );

        const requested = await postJson<{ readiness: { id: string } }>(
          pages.STUDENT,
          "/api/student/thesis-readiness",
          { studentMessage: "The synthetic examination copy is ready." },
          201,
        );
        await postJson(
          pages.SUPERVISOR,
          `/api/supervisor/thesis-readiness/${requested.readiness.id}/certify`,
          {
            decision: "CERTIFIED",
            checklist: {
              proposal: true,
              milestones: true,
              ethics: true,
              examinationCopy: true,
            },
            comments: "All synthetic readiness checks are satisfied.",
          },
        );
        await postJson(
          pages.HOD,
          `/api/hod/thesis-readiness/${requested.readiness.id}/approve`,
          { decision: "APPROVED", notes: "Approved for synthetic examination." },
        );

        const checksum = "a".repeat(64);
        const thesis = await prisma.thesis.create({
          data: {
            studentId,
            title: "Lifecycle E2E thesis",
            abstract: "Synthetic thesis used only in the isolated lifecycle test.",
            status: ThesisStatus.SUBMITTED,
          },
        });
        const thesisVersion = await prisma.thesisVersion.create({
          data: {
            thesisId: thesis.id,
            versionNumber: 1,
            isCurrent: true,
            manifestHash: "lifecycle-e2e-thesis-v1",
            submittedByUserId: studentUserId,
          },
        });
        await prisma.document.create({
          data: {
            documentType: DocumentType.THESIS,
            fileName: "lifecycle-e2e-thesis-v1.pdf",
            storagePath: "lifecycle-e2e/fixture/thesis-v1.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            checksumSha256: checksum,
            verificationStatus: DocumentVerificationStatus.VERIFIED,
            verifiedAt: new Date(),
            thesisId: thesis.id,
            thesisVersionId: thesisVersion.id,
          },
        });
        await prisma.thesisReadinessCertification.update({
          where: { id: requested.readiness.id },
          data: { thesisId: thesis.id },
        });

        const [examiner, secondExaminer] = await Promise.all([
          prisma.examiner.findUniqueOrThrow({
            where: { userId: "sample-examiner-user-1" },
          }),
          prisma.examiner.findUniqueOrThrow({
            where: { userId: "sample-examiner-user-2" },
          }),
        ]);
        const proposed = await postJson<{
          assignment: { id: string };
        }>(
          pages.ADMINISTRATOR,
          "/api/assignments/examiners",
          { thesisId: thesis.id, examinerId: examiner.id },
          201,
        );
        await postJson(
          pages.HOD,
          `/api/hod/examiner-assignments/${proposed.assignment.id}/decision`,
          { decision: "ACCEPTED" },
        );
        const secondProposed = await postJson<{
          assignment: { id: string };
        }>(
          pages.ADMINISTRATOR,
          "/api/assignments/examiners",
          { thesisId: thesis.id, examinerId: secondExaminer.id },
          201,
        );
        await postJson(
          pages.HOD,
          `/api/hod/examiner-assignments/${secondProposed.assignment.id}/decision`,
          { decision: "ACCEPTED" },
        );
        await postJson(
          pages.EXAMINER,
          `/api/examiner-assignments/${proposed.assignment.id}/report`,
          {
            recommendation: "MAJOR_CORRECTIONS",
            reportText:
              "The synthetic thesis is examinable but requires substantial documented corrections.",
          },
          201,
        );
        await prisma.thesisExaminerReport.create({
          data: {
            assignmentId: secondProposed.assignment.id,
            authorUserId: "sample-examiner-user-2",
            recommendation: "MAJOR_CORRECTIONS",
            reportText:
              "The second synthetic examiner independently requires major corrections.",
          },
        });

        const viva = await postJson<{ id: string }>(
          pages.ADMINISTRATOR,
          "/api/vivas",
          {
            thesisId: thesis.id,
            venue: "Lifecycle E2E virtual room",
            scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
          },
          201,
        );
        await postJson(
          pages.EXAMINER,
          `/api/vivas/${viva.id}/recommendation`,
          {
            recommendation: "MAJOR_CORRECTIONS",
            rationale:
              "The synthetic examination identified substantial but addressable corrections.",
          },
          201,
        );
        await prisma.vivaRecommendation.create({
          data: {
            vivaId: viva.id,
            assignmentId: secondProposed.assignment.id,
            authorUserId: "sample-examiner-user-2",
            recommendation: "MAJOR_CORRECTIONS",
            rationale:
              "The second synthetic examiner independently recommends major corrections.",
          },
        });
        await postJson(
          pages.HOD,
          `/api/hod/vivas/${viva.id}/outcome`,
          {
            outcome: "MAJOR_CORRECTIONS",
            reason: "Major corrections are required before completion.",
          },
        );
        const ordered = await postJson<{ order: { id: string } }>(
          pages.HOD,
          `/api/hod/vivas/${viva.id}/corrections`,
          {
            requirementType: "MAJOR",
            requirements:
              "Revise the synthetic methodology, results discussion, and final conclusions.",
            requiresExaminerReview: true,
          },
          201,
        );

        await prisma.thesisVersion.update({
          where: { id: thesisVersion.id },
          data: { isCurrent: false },
        });
        await prisma.document.updateMany({
          where: { thesisVersionId: thesisVersion.id },
          data: { isCurrentVersion: false },
        });
        const revisedVersion = await prisma.thesisVersion.create({
          data: {
            thesisId: thesis.id,
            versionNumber: 2,
            isCurrent: true,
            manifestHash: "lifecycle-e2e-thesis-v2",
            submittedByUserId: studentUserId,
          },
        });
        const submission = await prisma.correctionSubmission.create({
          data: {
            correctionOrderId: ordered.order.id,
            revisedThesisVersionId: revisedVersion.id,
            versionNumber: 1,
            responseSummary:
              "The methodology, results discussion, and conclusions were revised.",
            manifestHash: "lifecycle-e2e-thesis-v2",
            submittedByUserId: studentUserId,
          },
        });
        await prisma.document.create({
          data: {
            documentType: DocumentType.CORRECTION,
            fileName: "lifecycle-e2e-thesis-v2.pdf",
            storagePath: "lifecycle-e2e/fixture/thesis-v2.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            checksumSha256: "b".repeat(64),
            verificationStatus: DocumentVerificationStatus.VERIFIED,
            verifiedAt: new Date(),
            version: 2,
            thesisId: thesis.id,
            thesisVersionId: revisedVersion.id,
            correctionSubmissionId: submission.id,
          },
        });
        await prisma.correctionOrder.update({
          where: { id: ordered.order.id },
          data: { status: CorrectionOrderStatus.SUBMITTED },
        });

        await postJson(
          pages.SUPERVISOR,
          `/api/supervisor/corrections/${ordered.order.id}/review`,
          { decision: "CERTIFY", notes: "The revised synthetic evidence is complete." },
        );
        await prisma.correctionReview.create({
          data: {
            correctionSubmissionId: submission.id,
            stage: CorrectionReviewStage.EXAMINER,
            decision: CorrectionReviewDecision.APPROVED,
            reviewerUserId: "sample-examiner-user-2",
            thesisExaminerAssignmentId: secondProposed.assignment.id,
            notes: "Second synthetic Examiner approval fixture.",
          },
        });
        await postJson(
          pages.EXAMINER,
          `/api/examiner/corrections/${ordered.order.id}/review`,
          { decision: "APPROVE", notes: "The ordered synthetic corrections are complete." },
        );
        await postJson(
          pages.HOD,
          `/api/hod/corrections/${ordered.order.id}/decision`,
          { decision: "APPROVE", notes: "All required correction evidence is approved." },
        );

        await postJson(
          pages.HOD,
          `/api/hod/students/${studentId}/completion`,
          { comments: "All Department V1 completion evidence is satisfied." },
        );
        await postJson(
          pages.ADMINISTRATOR,
          `/api/admin/students/${studentId}/completion`,
          {},
        );
        await postJson(
          pages.ADMINISTRATOR,
          `/api/admin/students/${studentId}/graduation`,
          {
            graduationDate: new Date().toISOString(),
            confirmationReference: "E2E-GRAD-001",
            notes: "Synthetic graduation confirmation.",
          },
        );
        await postJson(
          pages.ADMINISTRATOR,
          `/api/admin/students/${studentId}/archive`,
          { reason: "Synthetic lifecycle completed and archived by E2E verification." },
        );

        const finalStudent = await prisma.student.findUniqueOrThrow({
          where: { id: studentId },
          include: {
            registrations: true,
            programmeCompletion: true,
            graduationRecord: true,
            archiveRecord: true,
            theses: true,
          },
        });
        expect(finalStudent.academicStatus).toBe("ARCHIVED");
        expect(finalStudent.registrations[0]?.status).toBe("ARCHIVED");
        expect(finalStudent.programmeCompletion?.status).toBe("COMPLETED");
        expect(finalStudent.graduationRecord?.status).toBe("GRADUATED");
        expect(finalStudent.archiveRecord?.status).toBe("ARCHIVED");
        expect(finalStudent.theses[0]?.status).toBe("ARCHIVED");

        const auditCount = await prisma.lifecycleAuditEvent.count({
          where: { actorUserId: { in: Object.keys(pages).map((role) => {
            const localIds: Record<string, string> = {
              HOD: "sample-hod-user",
              ADMINISTRATOR: "sample-admin-user",
              SUPERVISOR: "sample-supervisor-user-1",
              EXAMINER: "sample-examiner-user-1",
              STUDENT: studentUserId,
            };
            return localIds[role];
          }) } },
        });
        expect(auditCount).toBeGreaterThan(10);
      } finally {
        await Promise.allSettled(contexts.map((context) => context.close()));
        await prisma.$disconnect();
      }
    });
  },
);
