export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getUsdToGhsRate } from "@/lib/fx";

// GET /api/fx/rate — current live USD→GHS rate (cached ~1h server-side).
// Used by the admin UI to convert buyer USD prices to the Cedi payout value.
export async function GET() {
  const rate = await getUsdToGhsRate();
  return NextResponse.json({ rate });
}
