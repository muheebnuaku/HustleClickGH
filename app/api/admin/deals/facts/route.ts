export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { DEFAULT_FACTS, getFacts, saveFacts } from "@/lib/deals";

// Admin: the fact sheet Lana is limited to when drafting.
export async function GET() {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ facts: await getFacts(), defaults: DEFAULT_FACTS });
}

export async function PUT(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { facts } = await request.json();
    return NextResponse.json({ facts: await saveFacts(typeof facts === "string" ? facts : "") });
  } catch (error) {
    console.error("Deal facts save failed:", error);
    return NextResponse.json({ message: "Failed to save the fact sheet" }, { status: 500 });
  }
}
