import { ThesisStatus, VivaOutcome } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    examiner: {
      findUnique: vi.fn(),
    },
    viva: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  mapVivaOutcomeToThesisStatus,
  recordVivaOutcome,
} from "@/lib/vivas";
import { prisma } from "@/lib/prisma/client";

describe("viva workflow rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps each viva outcome to the next thesis state", () => {
    expect(mapVivaOutcomeToThesisStatus(VivaOutcome.PASS)).toBe(
      ThesisStatus.FINAL_ARCHIVE,
    );
    expect(mapVivaOutcomeToThesisStatus(VivaOutcome.MINOR_CORRECTIONS)).toBe(
      ThesisStatus.CORRECTIONS_REQUIRED,
    );
    expect(mapVivaOutcomeToThesisStatus(VivaOutcome.MAJOR_CORRECTIONS)).toBe(
      ThesisStatus.CORRECTIONS_REQUIRED,
    );
    expect(mapVivaOutcomeToThesisStatus(VivaOutcome.FAIL)).toBe(
      ThesisStatus.CLOSED,
    );
  });

  it("blocks outcome recording when the thesis is not under examination", async () => {
    vi.mocked(prisma.examiner.findUnique).mockResolvedValue({
      id: "examiner-1",
      userId: "user-examiner-1",
    } as never);
    vi.mocked(prisma.viva.findUnique).mockResolvedValue({
      id: "viva-1",
      thesisId: "thesis-1",
      outcome: null,
      thesis: {
        id: "thesis-1",
        title: "Adaptive Systems Thesis",
        abstract: "A thesis about adaptive systems.",
        status: ThesisStatus.SUBMITTED,
        student: {
          id: "student-1",
          user: {
            displayName: "Student One",
            email: "student@example.com",
          },
        },
        examinerAssignments: [
          {
            examinerId: "examiner-1",
            examinerUserId: "user-examiner-1",
          },
        ],
      },
    } as never);

    await expect(
      recordVivaOutcome(
        "viva-1",
        {
          outcome: VivaOutcome.PASS,
        },
        {
          uid: "firebase-examiner-1",
          userId: "user-examiner-1",
          firebaseUid: "firebase-examiner-1",
          role: "EXAMINER",
          email: "examiner@example.com",
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Viva outcomes can only be recorded while the thesis is UNDER_EXAMINATION.",
    });
  });
});
