import { isAppUserRole, type AppUserRole } from "@/types/auth";

export function assertRoleAuthorized(
  role: AppUserRole | null | undefined,
  allowedRoles: AppUserRole[],
): AppUserRole {
  if (!role || !isAppUserRole(role) || !allowedRoles.includes(role)) {
    throw new Error("Forbidden");
  }

  return role;
}
