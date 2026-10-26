export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { DealInputError, INTENTS, draftEmail, type Intent } from "@/lib/deals";

// Admin: Lana drafts (or polishes) an e-mail for this deal. Nothing is sent here.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    const b = await request.json();
    const intent: Intent = INTENTS.includes(b.intent) ? b.intent : "qualify";
    const instruction = typeof b.instruction === "string" ? b.instruction.trim() : "";
    if (intent === "custom" && !instruction) return NextResponse.json({ message: "Tell Lana what to write" }, { status: 400 });
    const draft = await draftEmail(id, intent, instruction, {
      tone: typeof b.tone === "string" ? b.tone : undefined,
      length: typeof b.length === "string" ? b.length : undefined,
      ownerDraft: typeof b.ownerDraft === "string" ? b.ownerDraft : undefined,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof DealInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Deal draft failed:", error);
    return NextResponse.json({ message: (error as Error).message || "Lana could not draft this e-mail" }, { status: 500 });
  }
}
