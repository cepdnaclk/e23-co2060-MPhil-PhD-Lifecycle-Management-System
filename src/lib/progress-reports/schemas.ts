import { z } from "zod";

import { sanitizedString } from "@/lib/validation/schemas";

export const progressReportSubmissionSchema = z.object({
  periodLabel: sanitizedString.min(1, "Period label is required."),
  narrative: sanitizedString.min(
    100,
    "Narrative must be at least 100 characters long.",
  ),
});

export type ProgressReportSubmissionInput = z.infer<
  typeof progressReportSubmissionSchema
>;
