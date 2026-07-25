import { ThesisStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    thesis: {
      findUnique: vi.fn(),
    },
    viva: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma/client";
import { scheduleViva } from "@/lib/vivas";

describe("viva scheduling rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const authContext = {
    uid: "admin-firebase",
    userId: "admin-user-1",
    firebaseUid: "admin-firebase",
    role: UserRole.ADMINISTRATOR,
    email: "admin@example.com",
  };

  it("blocks scheduling when the thesis is not under examination", async () => {
    vi.mocked(prisma.thesis.findUnique).mockResolvedValue({
      id: "thesis-1",
      status: ThesisStatus.SUBMITTED,
      title: "Some Thesis",
      student: {
        userId: "student-1",
        user: { email: "student@test.com", displayName: "Student One" },
      },
      examinerAssignments: [],
    } as never);

    const validDateInFuture = new Date();
    validDateInFuture.setDate(validDateInFuture.getDate() + 5);

    await expect(
      scheduleViva(
        {
          thesisId: "thesis-1",
          venue: "Room 101",
          scheduledDate: validDateInFuture,
        },
        authContext,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "A viva can only be scheduled if the thesis is UNDER_EXAMINATION.",
    });
  });

  it("fails validation if scheduled date is in the past", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    await expect(
      scheduleViva(
        {
          thesisId: "thesis-1",
          venue: "Room 101",
          scheduledDate: pastDate,
        },
        authContext,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Scheduled date must be in the future",
    });
  });
});
