export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/lib/deals";

// Admin: Deals preferences — follow-up gap, whether Lana analyses deals on her own, default tone and length.
export async function GET() {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
}

export async function PUT(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { settings } = await request.json();
    return NextResponse.json({ settings: await saveSettings(settings) });
  } catch (error) {
    console.error("Deal settings save failed:", error);
    return NextResponse.json({ message: "Failed to save settings" }, { status: 500 });
  }
}
