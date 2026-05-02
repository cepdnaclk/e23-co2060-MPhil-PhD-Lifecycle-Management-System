import { z } from "zod";

import { sanitizedString } from "@/lib/validation/schemas";

export const proposalEvaluationSchema = z.object({
  numericalScore: z
    .number({ invalid_type_error: "Score must be numeric." })
    .int("Score must be a whole number.")
    .min(0, "Score must be between 0 and 100.")
    .max(100, "Score must be between 0 and 100."),
  feedback: sanitizedString.min(
    50,
    "Feedback must be at least 50 characters long.",
  ),
});

export type ProposalEvaluationInput = z.infer<typeof proposalEvaluationSchema>;
