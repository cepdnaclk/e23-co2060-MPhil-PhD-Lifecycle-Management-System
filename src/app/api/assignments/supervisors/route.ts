import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  assignSupervisorToStudent,
  getAllStudentAssignments,
  SupervisorAssignmentError,
} from "@/lib/assignments/supervisors";
import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(async (request: NextRequest, context) => {
  try {
    const students = await getAllStudentAssignments(context.auth);
    return NextResponse.json({ students });
  } catch {
    return NextResponse.json(
      { error: "Unable to load student assignments." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);

export const POST = withAuth(async (request: NextRequest, context) => {

  const body = await request.json();

  try {
    const assignment = await assignSupervisorToStudent(body, context.auth);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error("[SupervisorAssignmentAPI]", error);
    if (error instanceof SupervisorAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Unable to assign the supervisor." },
      { status: 500 },
    );
  }
}, [UserRole.ADMINISTRATOR]);
