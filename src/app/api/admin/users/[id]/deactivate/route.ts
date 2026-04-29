import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  AdminUserManagementError,
  deactivateAdminManagedUser,
} from "@/lib/admin/user-management";
import { withAuth } from "@/lib/firebase/with-auth";

type RouteParams = {
  id: string;
};

export const PATCH = withAuth<RouteParams>(
  async (_request: NextRequest, context) => {
    try {
      const user = await deactivateAdminManagedUser(context.params?.id ?? "");

      return NextResponse.json({
        user: {
          id: user.id,
          isActive: user.isActive,
          role: user.role,
        },
      });
    } catch (error) {
      if (error instanceof AdminUserManagementError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }

      return NextResponse.json(
        { error: "Unable to deactivate the user account." },
        { status: 500 },
      );
    }
  },
  [UserRole.ADMINISTRATOR],
);
