export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { savePremiumSettings } from "@/lib/premium";

// Admin: price, length, early-access window and the MoMo account members pay into.
export async function PUT(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { settings } = await request.json().catch(() => ({}));
  if (!settings || typeof settings !== "object") return NextResponse.json({ message: "settings required" }, { status: 400 });
  return NextResponse.json({ settings: await savePremiumSettings(settings) });
}
