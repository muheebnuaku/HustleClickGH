export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { triageDeal } from "@/lib/deals";

// Admin: Lana classifies the deal (buyer / supply partner / pitch / spam) and lists red flags and gaps.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json({ triage: await triageDeal(id) });
  } catch (error) {
    console.error("Deal triage failed:", error);
    return NextResponse.json({ message: (error as Error).message || "Lana could not analyse this deal" }, { status: 500 });
  }
}
