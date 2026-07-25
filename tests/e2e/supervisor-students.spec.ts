import { expect, test } from "@playwright/test";

test.describe("authenticated supervisor dashboard", { tag: "@external" }, () => {
  test("clicking a student's name opens the supervisor student profile page", async ({
    page,
  }) => {
    await page.route("**/api/supervisor/students", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          students: [
            {
              assignmentId: "assignment-1",
              assignedAt: "2026-05-01T04:00:00.000Z",
              isPrimary: true,
              student: {
                id: "student-1",
                userId: "user-student-1",
                displayName: "Student One",
                email: "student1@example.com",
                programType: "MPHIL",
                academicStatus: "ACTIVE",
              },
              currentRegistration: {
                id: "registration-1",
                status: "LAPSED",
                startDate: "2025-01-01T00:00:00.000Z",
                expirationDate: "2026-01-01T00:00:00.000Z",
              },
              latestProposal: {
                id: "proposal-1",
                title: "Adaptive Systems",
                status: "UNDER_REVIEW",
                updatedAt: "2026-04-30T10:00:00.000Z",
              },
            },
          ],
        }),
      });
    });

    await page.route("**/api/students/student-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          student: {
            id: "student-1",
            userId: "user-student-1",
            programType: "MPHIL",
            academicStatus: "ACTIVE",
            enrollmentDate: "2026-01-15T00:00:00.000Z",
            user: {
              id: "user-student-1",
              email: "student1@example.com",
              displayName: "Student One",
            },
            supervisors: [],
          },
        }),
      });
    });

    await page.goto("/dashboard/supervisor/students");
    await page.getByRole("link", { name: "Student One" }).first().click();

    await expect(page).toHaveURL(
      /\/dashboard\/supervisor\/students\/student-1$/,
    );
    await expect(page.getByText("Student One")).toBeVisible();
  });
});
