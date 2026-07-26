/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SupervisorStudentsPanel } from "@/components/supervisor/supervisor-students-panel";

describe("supervisor students panel", () => {
  it("shows the expected completion date for an active registration", () => {
    render(
      <SupervisorStudentsPanel
        initialStudents={[
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
              status: "ACTIVE",
              startDate: "2025-01-01T00:00:00.000Z",
              expectedCompletionDate: "2026-01-01T00:00:00.000Z",
            },
            latestProposal: {
              id: "proposal-1",
              title: "Adaptive Systems",
              status: "UNDER_REVIEW",
              updatedAt: "2026-04-30T10:00:00.000Z",
            },
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Student One")).toHaveLength(2);
    expect(screen.getByTestId("registration-badge-student-1")).toHaveTextContent(
      "ACTIVE · Expected completion",
    );
  });
});
