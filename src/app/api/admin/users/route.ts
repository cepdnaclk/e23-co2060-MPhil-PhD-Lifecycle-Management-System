import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  AdminUserManagementError,
  createAdminManagedUser,
  listAdminManagedUsers,
} from "@/lib/admin/user-management";
import { withAuth } from "@/lib/firebase/with-auth";

const createAdminUserSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  displayName: z.string().min(1, "Display name is required."),
  role: z.enum([
    UserRole.SUPERVISOR,
    UserRole.EXAMINER,
    UserRole.ADMINISTRATOR,
  ]),
  department: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
});

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const role = request.nextUrl.searchParams.get("role") ?? undefined;
    const users = await listAdminManagedUsers(role);

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof AdminUserManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to load administrator-managed users." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const parsedBody = createAdminUserSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid request payload." },
      { status: 400 },
    );
  }

  try {
    const result = await createAdminManagedUser(parsedBody.data);

    if (!result.user) {
      return NextResponse.json(
        { error: "Unable to create the user account." },
        { status: 500 },
      );
    }

    const { user } = result;

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          isActive: user.isActive,
          firebaseUid: user.firebaseUid,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AdminUserManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to create the user account." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
