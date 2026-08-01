import { NextResponse } from "next/server";

import {
  assertPublicDraftCreationRateLimit,
  createPublicApplicationDraft,
  loadPublicApplicationDraft,
  PublicDraftCapabilityError,
  savePublicApplicationDraft,
} from "@/lib/uploads/capabilities";

export async function POST(request: Request) {
  try {
    await assertPublicDraftCreationRateLimit(request);
    const draft = await createPublicApplicationDraft();
    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    if (error instanceof PublicDraftCapabilityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to initialize the application draft." },
      { status: 500 },
    );
  }
}

async function handleDraftAction(
  request: Request,
  action: (input: unknown) => Promise<unknown>,
) {
  try {
    const result = await action(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PublicDraftCapabilityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to access the protected application draft." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  return handleDraftAction(request, loadPublicApplicationDraft);
}

export async function PATCH(request: Request) {
  return handleDraftAction(request, savePublicApplicationDraft);
}
