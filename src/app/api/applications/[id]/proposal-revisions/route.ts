import { NextResponse, type NextRequest } from "next/server";

import {
  applicationProposalRevisionSchema,
  ProposalRevisionError,
  submitApplicationProposalRevision,
} from "@/lib/applications/proposal-revisions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = applicationProposalRevisionSchema.safeParse(
    await request.json(),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid proposal revision.",
      },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    const version = await submitApplicationProposalRevision(id, parsed.data);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    if (error instanceof ProposalRevisionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to submit proposal revision." },
      { status: 500 },
    );
  }
}
