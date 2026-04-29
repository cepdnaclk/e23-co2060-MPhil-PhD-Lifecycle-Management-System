export const APP_USER_ROLES = [
  "STUDENT",
  "SUPERVISOR",
  "EXAMINER",
  "ADMINISTRATOR",
] as const;

export type AppUserRole = (typeof APP_USER_ROLES)[number];

export type AuthenticatedUserContext = {
  uid: string;
  userId: string;
  firebaseUid: string;
  role: AppUserRole;
  email?: string | null;
};

export function isAppUserRole(value: unknown): value is AppUserRole {
  return typeof value === "string" && APP_USER_ROLES.includes(value as AppUserRole);
}
