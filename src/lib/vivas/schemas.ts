import { VivaOutcome } from "@prisma/client";
import { z } from "zod";

import { sanitizedString } from "@/lib/validation/schemas";

export const vivaOutcomeSubmissionSchema = z.object({
  outcome: z.nativeEnum(VivaOutcome),
});

export const scheduleVivaSchema = z.object({
  thesisId: sanitizedString.min(1, "Thesis ID is required"),
  venue: sanitizedString.min(1, "Venue is required"),
  scheduledDate: z.coerce.date().refine((date) => date > new Date(), {
    message: "Scheduled date must be in the future",
  }),
});
