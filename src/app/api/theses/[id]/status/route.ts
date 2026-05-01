import { ThesisStatus, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/firebase/with-auth";
import { assertValidThesisStatusTransition } from "@/lib/prisma/thesis-status";
import { prisma } from "@/lib/prisma/client";

const updateThesisStatusSchema = z.object({
  status: z.nativeEnum(ThesisStatus),
});

type RouteParams = {
  id: string;
};

export const PATCH = withAuth<RouteParams>(
  async (request: NextRequest, context) => {
    const parsed = updateThesisStatusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid thesis status." },
        { status: 400 },
      );
    }

    const thesis = await prisma.thesis.findUnique({
      where: { id: context.params?.id ?? "" },
      select: { id: true, status: true },
    });

    if (!thesis) {
      return NextResponse.json({ error: "Thesis not found." }, { status: 404 });
    }

    try {
      assertValidThesisStatusTransition(thesis.status, parsed.data.status);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid thesis status transition.",
        },
        { status: 409 },
      );
    }

    const updatedThesis = await prisma.thesis.update({
      where: { id: thesis.id },
      data: { status: parsed.data.status },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ thesis: updatedThesis });
  },
  [UserRole.ADMINISTRATOR],
);
