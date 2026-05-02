import { z } from "zod";

import type { AppUserRole } from "@/types/auth";
import { isAppUserRole } from "@/types/auth";
import { sanitizedEmail, sanitizedString, securePassword } from "@/lib/validation/schemas";

export const loginCredentialsSchema = z.object({
  email: sanitizedEmail,
  password: securePassword,
});

export const createSessionRequestSchema = z.object({
  idToken: sanitizedString.min(1, "Missing idToken."),
});

export const syncFirebaseClaimsRequestSchema = z.object({
  userId: sanitizedString.min(1, "A user id is required."),
  firebaseUid: sanitizedString.min(1, "A Firebase UID is required."),
  role: z.custom<AppUserRole>((value) => isAppUserRole(value), {
    message: "A valid application role is required.",
  }),
});
