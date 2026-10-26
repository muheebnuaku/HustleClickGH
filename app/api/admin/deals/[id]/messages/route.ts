export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { DealInputError, addMessage, loadDeal } from "@/lib/deals";

// Admin: send an e-mail (kind "email"), log one sent elsewhere ("logged"), or add a private note ("note").
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await adminUserId();
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    const b = await request.json();
    if (!["email", "logged", "note"].includes(b.kind)) return NextResponse.json({ message: "Invalid message type" }, { status: 400 });
    await addMessage({
      dealId: id,
      kind: b.kind,
      subject: typeof b.subject === "string" ? b.subject : undefined,
      body: typeof b.body === "string" ? b.body : "",
      toEmail: typeof b.toEmail === "string" ? b.toEmail : undefined,
      aiDrafted: b.aiDrafted === true,
      userId,
    });
    return NextResponse.json({ deal: await loadDeal(id) });
  } catch (error) {
    if (error instanceof DealInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Deal message failed:", error);
    return NextResponse.json({ message: "Failed to save the message" }, { status: 500 });
  }
}
