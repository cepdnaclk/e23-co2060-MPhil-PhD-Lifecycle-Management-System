import { NextResponse } from "next/server";

import {
  assertPublicDraftCreationRateLimit,
  createPublicApplicationDraft,
  PublicDraftCapabilityError,
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
