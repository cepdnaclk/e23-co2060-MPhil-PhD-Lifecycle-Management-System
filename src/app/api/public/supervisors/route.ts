import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const supervisors = await prisma.supervisor.findMany({
    where: {
      user: { isActive: true },
    },
    orderBy: {
      user: { displayName: "asc" },
    },
    select: {
      id: true,
      specialization: true,
      user: {
        select: {
          displayName: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      supervisors: supervisors.map((supervisor) => ({
        id: supervisor.id,
        displayName: supervisor.user.displayName,
        specialization: supervisor.specialization,
      })),
    },
    {
      headers: { "Cache-Control": "public, max-age=300" },
    },
  );
}
