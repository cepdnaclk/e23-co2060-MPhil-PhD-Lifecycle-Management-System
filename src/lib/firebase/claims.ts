import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import { type AppUserRole } from "@/types/auth";
import { setCustomClaimsForUser } from "@/lib/firebase/admin";

const roleToPrismaRole: Record<AppUserRole, UserRole> = {
  STUDENT: UserRole.STUDENT,
  SUPERVISOR: UserRole.SUPERVISOR,
  EXAMINER: UserRole.EXAMINER,
  ADMINISTRATOR: UserRole.ADMINISTRATOR,
};

type SyncFirebaseClaimsInput = {
  userId: string;
  firebaseUid: string;
  role: AppUserRole;
};

export async function syncFirebaseClaimsToUser(
  input: SyncFirebaseClaimsInput,
) {
  await setCustomClaimsForUser(input.firebaseUid, input.role);

  return prisma.user.update({
    where: { id: input.userId },
    data: {
      firebaseUid: input.firebaseUid,
      role: roleToPrismaRole[input.role],
    },
  });
}
