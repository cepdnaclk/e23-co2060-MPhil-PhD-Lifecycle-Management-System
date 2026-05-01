import { UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  assertStudentHasActiveRegistration,
  RegistrationError,
} from "@/lib/registrations";
import { withAuth } from "@/lib/firebase/with-auth";
import { prisma } from "@/lib/prisma/client";

const progressReportSchema = z.object({
  periodLabel: z.string().min(1, "Period label is required."),
  narrative: z.string().min(100, "Narrative must be at least 100 characters long."),
});

export const GET = withAuth(
  async (_request: NextRequest, context) => {
    try {
      await assertStudentHasActiveRegistration(context.auth);

      const student = await prisma.student.findUnique({
        where: { userId: context.auth.userId },
        select: { id: true },
      });

      if (!student) {
        return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
      }

      const reports = await prisma.progressReport.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        ok: true,
        reports,
      });
    } catch (error) {
      if (error instanceof RegistrationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json(
        { error: "Unable to load progress reports." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);

export const POST = withAuth(
  async (request: NextRequest, context) => {
    try {
      await assertStudentHasActiveRegistration(context.auth);

      const body = await request.json();
      const parsed = progressReportSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
          { status: 400 },
        );
      }

      const student = await prisma.student.findUnique({
        where: { userId: context.auth.userId },
        select: { id: true },
      });

      if (!student) {
        return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
      }

      const report = await prisma.progressReport.create({
        data: {
          studentId: student.id,
          periodLabel: parsed.data.periodLabel,
          narrative: parsed.data.narrative,
        },
      });

      return NextResponse.json({ ok: true, report }, { status: 201 });
    } catch (error) {
      if (error instanceof RegistrationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      // Handle Prisma unique constraint violation (P2002)
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return NextResponse.json(
          { error: "A progress report for this period already exists." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: "Unable to submit progress report." },
        { status: 500 },
      );
    }
  },
  [UserRole.STUDENT],
);
