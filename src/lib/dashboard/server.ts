import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/firebase/auth";
import { buildDashboardPageMeta, getDashboardSummaryForUser } from "@/lib/dashboard/summary";
import { mapAppRoleToDashboardRole, type DashboardRole } from "@/types/dashboard";

export async function getServerDashboardContext(role: DashboardRole) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const auth = await getCurrentUser({
    headers: new Headers({
      cookie: cookieHeader,
    }),
  });

  if (!auth) {
    redirect("/login");
  }

  const actualRole = mapAppRoleToDashboardRole(auth.role);

  if (actualRole !== role) {
    redirect(`/dashboard/${actualRole}`);
  }

  const [summary, meta] = await Promise.all([
    getDashboardSummaryForUser(auth, role),
    Promise.resolve(buildDashboardPageMeta(role)),
  ]);

  return {
    auth,
    summary,
    meta,
  };
}
