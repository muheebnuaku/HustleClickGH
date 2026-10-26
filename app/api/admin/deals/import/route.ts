export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { importLeadsCsv } from "@/lib/deals";

// Admin: import leads in growth/leads.csv format (companies already in Deals are skipped).
export async function POST(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { csv } = await request.json();
    if (typeof csv !== "string" || !csv.trim() || csv.length > 2_000_000) {
      return NextResponse.json({ message: "Paste a CSV (max 2 MB)" }, { status: 400 });
    }
    return NextResponse.json(await importLeadsCsv(csv));
  } catch (error) {
    console.error("Deals import failed:", error);
    return NextResponse.json({ message: "Import failed: check the CSV has a header row with a 'company' column" }, { status: 400 });
  }
}
